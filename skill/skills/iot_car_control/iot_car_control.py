"""
IoT 控制用戶端

此模組提供透過 MQTT 協定與 (ESP32-E DevKit V3) 進行雙向通訊的功能。
支援遠端控制指令發送以及即時狀態數據監控。

主要功能：
- MQTT 連線管理（含自動重連機制）
- 控制指令發送（執行任務、待命、回到定點）
- 狀態數據接收與顯示
- 互動式控制台介面
"""

import paho.mqtt.client as mqtt
import json
import time
import threading
import logging
from enum import Enum
from typing import Optional, Callable, Dict, Any

# 設定日誌格式，包含時間戳、日誌級別和訊息內容
logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] %(levelname)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)


# ============================================================================
# 指令列舉類別
# ============================================================================
class Command(Enum):
    """
    控制指令列舉

    定義支援的五種自動化垃圾桶清除指令：
    """

    RECYCLABLE_PLUS = "recyclable+1"
    NON_RECYCLABLE_PLUS = "nonrecyclable+1"
    RECYCLABLE_MINUS = "recyclable-1"
    NON_RECYCLABLE_MINUS = "nonrecyclable-1"
    RESET = "reset"

    @classmethod
    def from_string(cls, value: str) -> Optional["Command"]:
        """
        從字串轉換為指令列舉

        Args:
            value: 指令字串值

        Returns:
            對應的 Command 物件，若無效則返回 None
        """
        try:
            return cls(value)
        except ValueError:
            return None

    @classmethod
    def get_valid_commands(cls) -> list:
        """
        取得所有合法的指令列表

        Returns:
            包含所有指令值字串的列表
        """
        return [cmd.value for cmd in cls]


# ============================================================================
# QoS 服務品質等級列舉
# ============================================================================
class QoSLevel(Enum):
    """
    MQTT QoS 服務品質等級

    - AT_MOST_ONCE (0): 最多傳送一次，不確認（最多一次）
    - AT_LEAST_ONCE (1): 至少傳送一次，需確認（至少一次）
    - EXACTLY_ONCE (2): 精確傳送一次，需雙重確認（精確一次）
    """

    AT_MOST_ONCE = 0
    AT_LEAST_ONCE = 1
    EXACTLY_ONCE = 2


# ============================================================================
# 配置類別
# ============================================================================
class Config:
    """
    MQTT 連線與通訊配置參數

    所有配置參數集中在此類別中管理，方便修改與擴展。
    """

    # MQTT Broker 連線參數
    BROKER = "broker.emqx.io"  # MQTT Broker 位址
    PORT = 1883  # MQTT Broker 連接埠
    KEEPALIVE = 60  # 心跳間隔時間（秒）

    # 重連參數
    RECONNECT_DELAY = 5  # 重連失敗後的基礎延遲時間（秒）
    MAX_RECONNECT_ATTEMPTS = 10  # 最大重連次數

    # MQTT 主題配置
    TOPIC_COMMAND = "trashbin/command"  # 指令發布主題
    TOPIC_STATUS = "trashbin/status"  # 狀態訂閱主題

    # 認證參數（可選，需自行設定）
    USERNAME: Optional[str] = None  # MQTT 用戶名稱
    PASSWORD: Optional[str] = None  # MQTT 密碼

    # QoS 服務品質等級
    QOS_COMMAND = QoSLevel.AT_LEAST_ONCE.value  # 指令發布 QoS
    QOS_STATUS = QoSLevel.AT_LEAST_ONCE.value  # 狀態訂閱 QoS

    # Will 遺囑訊息配置
    WILL_PAYLOAD = {"status": "disconnected"}  # Will 訊息內容
    WILL_QOS = 1  # Will 訊息 QoS
    WILL_RETAIN = True  # Will 訊息是否保留


# ============================================================================
# IoT 智能車 MQTT 客戶端類別
# ============================================================================
class IoTCarClient:
    """
    MQTT 客戶端

    封裝 MQTT 連線、指令發送、狀態接收等核心功能。
    支援自動重連、執行緒安全操作。

    Attributes:
        config: MQTT 配置物件
    """

    def __init__(self, config: Optional[Config] = None):
        """
        初始化客戶端

        Args:
            config: Config 物件，若為 None則使用預設配置
        """
        self.config = config or Config()  # 使用傳入的配置或建立新的預設配置

        # MQTT 客戶端物件
        self._client: Optional[mqtt.Client] = None

        # 執行緒同步事件
        self._connected = threading.Event()  # 連線狀態事件
        self._running = threading.Event()  # 執行狀態事件

        # 執行緒鎖定（確保並發安全）
        self._command_lock = threading.Lock()  # 指令發送鎖定

        # 重連計數器
        self._reconnect_count = 0

        # 回調函式列表
        self._handlers: Dict[str, Callable] = {}  # 訊息處理器（預留）
        self._callbacks: list = []  # 狀態回調函式列表

    def set_auth(self, username: str, password: str):
        """
        設定 MQTT 認證用戶名稱與密碼

        Args:
            username: MQTT 用戶名稱
            password: MQTT 密碼
        """
        self.config.USERNAME = username
        self.config.PASSWORD = password

    def register_handler(self, callback: Callable[[dict], None]):
        """
        註冊狀態數據回調函式

        當收到狀態訊息時，會自動呼叫已註冊的回調函式。

        Args:
            callback: 接受狀態數據字典的回調函式
        """
        self._callbacks.append(callback)

    def _setup_client(self):
        """
        設定 MQTT 客戶端

        建立 MQTT 客戶端物件並設定回調函式、Will 訊息等。
        此為內部方法，由 connect() 自動呼叫。
        """
        # 建立 MQTT 客戶端
        # client_id 為唯一識別碼，使用時間戳確保不重複
        client = mqtt.Client(
            client_id=f"iot_car_{int(time.time())}",
            clean_session=True,  # 清除之前的 session 狀態
            protocol=mqtt.MQTTv311,  # 使用 MQTT v3.1.1 協定
        )

        # 設定用戶名稱與密碼認證（如有設定）
        if self.config.USERNAME and self.config.PASSWORD:
            client.username_pw_set(self.config.USERNAME, self.config.PASSWORD)
            logger.info("MQTT 認證已啟用")

        # 設定回調函式
        client.on_connect = self._on_connect  # 連線回調
        client.on_disconnect = self._on_disconnect  # 斷線回調
        client.on_message = self._on_message  # 訊息接收回調
        client.on_publish = self._on_publish  # 訊息發布回調

        # 設定 Will 遺囑訊息
        # 當客戶端意外斷線時，Broker 會自動發布此訊息
        will_payload = json.dumps(self.config.WILL_PAYLOAD)
        client.will_set(
            self.config.TOPIC_STATUS,  # Will 訊息發布的主題
            payload=will_payload,  # Will 訊息內容
            qos=self.config.WILL_QOS,  # Will 訊息 QoS
            retain=self.config.WILL_RETAIN,  # 是否保留 Will 訊息
        )
        logger.info("MQTT Will 訊息已設定")

        # 儲存客戶端物件
        self._client = client

    def _on_connect(self, client, userdata, flags, rc):
        """
        MQTT 連線回調函式

        當客戶端連線至 Broker 時自動被呼叫。

        Args:
            client: MQTT 客戶端物件
            userdata: 自訂使用者資料
            flags: 連線標誌
            rc: 連線返回碼（0 表示成功）
        """
        if rc == 0:
            # 連線成功
            logger.info(
                f"已成功連線至 MQTT Broker ({self.config.BROKER}:{self.config.PORT})"
            )
            self._connected.set()  # 設定連線事件為已連線
            self._reconnect_count = 0  # 重設計數器

            # 訂閱狀態主題
            client.subscribe(self.config.TOPIC_STATUS, qos=self.config.QOS_STATUS)
            logger.info(f"已訂閱狀態主題: {self.config.TOPIC_STATUS}")
        else:
            # 連線失敗
            logger.warning(f"連線失敗，返回碼: {rc}")
            self._connected.clear()  # 清除連線事件

    def _on_disconnect(self, client, userdata, rc):
        """
        MQTT 斷線回調函式

        當客戶端與 Broker 斷線時自動被呼叫。

        Args:
            client: MQTT 客戶端物件
            userdata: 自訂使用者資料
            rc: 斷線返回碼（0 表示正常斷線，非0表示異常斷線）
        """
        logger.info(f"已斷線 MQTT Broker (rc: {rc})")
        self._connected.clear()  # 清除連線事件

        # 如果是異常斷線 且 正在執行中，嘗試重連
        if rc != 0 and self._running.is_set():
            self._attempt_reconnect()

    def _on_message(self, client, userdata, msg):
        """
        MQTT 訊息接收回調函式

        當收到狀態主題的訊息時自動被呼叫。

        Args:
            client: MQTT 客戶端物件
            userdata: 自訂使用者資料
            msg: MQTT 訊息物件
        """
        try:
            # 解碼訊息內容
            payload = msg.payload.decode("utf-8")
            # 解析 CSV 資料: recyclableCount,nonRecyclableCount,total,lastUpdate,alertActive
            parts = payload.split(',')
            if len(parts) >= 5:
                data = {
                    "recyclableCount": int(parts[0]),
                    "nonRecyclableCount": int(parts[1]),
                    "total": int(parts[2]),
                    "lastUpdate": parts[3],
                    "alertActive": int(parts[4]) == 1
                }

                # 呼叫所有已註冊的回調函式
                for callback in self._callbacks:
                    callback(data)

                # 顯示狀態資訊
                self._display_status(data)
            else:
                logger.warning(f"接收到非正確格式訊息 (主題: {msg.topic}): {payload}")

        except Exception as e:
            # 處理訊息時發生錯誤
            logger.error(f"處理訊息時發生錯誤: {e}")

    def _on_publish(self, client, userdata, mid):
        """
        MQTT 訊息發布回調函式

        當訊息發布成功時自動被呼叫（用於除錯）。

        Args:
            client: MQTT 客戶端物件
            userdata: 自訂使用者資料
            mid: 訊息 ID
        """
        logger.debug(f"訊息 {mid} 發布成功")

    def _display_status(self, data: dict):
        """
        顯示狀態數據

        將接收到的狀態數據格式化輸出至主控台。

        Args:
            data: 狀態數據字典
        """
        recyclable = data.get("recyclableCount", 0)
        non_recyclable = data.get("nonRecyclableCount", 0)
        total = data.get("total", 0)
        last_update = data.get("lastUpdate", "--:--:--")
        alert = "⚠️ 滿桶請清潔" if data.get("alertActive") else "✅ 狀態正常"

        # 格式化輸出
        print("\n" + "=" * 30)
        print("🗑️ 垃圾桶狀態回報")
        print("=" * 30)
        print(f"♻️ 可回收數量       : {recyclable}")
        print(f"🗑️ 不可回收數量     : {non_recyclable}")
        print(f"📊 總數             : {total}")
        print(f"🕒 更新時間         : {last_update}")
        print(f"📢 系統狀態         : {alert}")
        print("=" * 30 + "\n")

    def _attempt_reconnect(self):
        """
        嘗試自動重連

        當連線中斷時，自動嘗試重新連線。
        採用指數遞增延遲策略，避免頻繁重連造成伺服器負擔。
        """
        # 檢查是否超過最大重連次數
        if self._reconnect_count >= self.config.MAX_RECONNECT_ATTEMPTS:
            logger.error("已達到最大重連次數")
            return

        # 增加重連計數
        self._reconnect_count += 1

        # 計算延遲時間（指數遞增）
        delay = self.config.RECONNECT_DELAY * self._reconnect_count
        logger.info(f"準備重連，{delay} 秒後進行第 {self._reconnect_count} 次嘗試...")

        # 等待延遲時間
        time.sleep(delay)

        # 嘗試重連
        try:
            self._client.reconnect()
        except Exception as e:
            logger.error(f"重連失敗: {e}")

    def connect(self, timeout: float = 10.0) -> bool:
        """
        連線至 MQTT Broker

        建立與 MQTT Broker 的連線，並啟動網路迴圈。

        Args:
            timeout: 連線逾時時間（秒）

        Returns:
            連線是否成功
        """
        # 設定 MQTT 客戶端
        self._setup_client()

        logger.info(f"正在連線至 MQTT Broker: {self.config.BROKER}...")

        try:
            # 連線至 Broker
            # keepalive 參數設定心跳間隔，逾時時 Broker 會主動斷開連線
            self._client.connect(
                self.config.BROKER,
                self.config.PORT,
                keepalive=int(self.config.KEEPALIVE),
            )
        except Exception as e:
            logger.error(f"無法連線至 MQTT Broker: {e}")
            return False

        # 啟動非阻塞式的網路迴圈
        # loop_start() 會在背景執行緒處理網路通訊
        self._client.loop_start()
        self._running.set()  # 設定為執行中狀態

        # 等待連線完成
        if self._connected.wait(timeout=timeout):
            return True
        else:
            logger.error("連線逾時")
            return False

    def disconnect(self):
        """
        斷開 MQTT 連線

        停止網路迴圈並斷開與 Broker 的連線。
        """
        self._running.clear()  # 停止執行
        self._connected.clear()  # 清除連線狀態

        if self._client:
            self._client.loop_stop()  # 停止網路迴圈
            self._client.disconnect()  # 斷開連線
            logger.info("已斷開 MQTT Broker 連線")

    def send_command(self, command: Command) -> bool:
        """
        發送控制指令

        將控制指令發布至指令主題。

        Args:
            command: Command 列舉物件

        Returns:
            指令發送是否成功
        """
        # 檢查連線狀態
        if not self._connected.is_set():
            logger.error("未連線至 MQTT Broker")
            return False

        # 檢查指令有效性
        if command not in Command:
            logger.error(f"無效的指令: {command}")
            return False

        # 使用鎖定確保執行緒安全（防止並發發送）
        with self._command_lock:
            # 直接發送純字串指令 (如 recyclable+1)
            payload = command.value

            # 發布訊息
            result = self._client.publish(
                self.config.TOPIC_COMMAND, payload, qos=self.config.QOS_COMMAND
            )

            # 檢查發布結果
            if result.rc == mqtt.MQTT_ERR_SUCCESS:
                logger.info(f"指令 '{command.value}' 發送成功")
                return True
            else:
                logger.error(f"指令發送失敗: {result.rc}")
                return False

    def is_connected(self) -> bool:
        """
        檢查連線狀態

        Returns:
            是否已連線
        """
        return self._connected.is_set()


# ============================================================================
# 互動式控制台類別
# ============================================================================
class InteractiveConsole:
    """
    互動式控制台

    提供文字介面讓使用者輸入指令。
    """

    def __init__(self, client: IoTCarClient):
        """
        初始化控制台

        Args:
            client: IoTCarClient 物件
        """
        self.client = client

    def run(self):
        """
        啟動控制台迴圈

        持續接受使用者輸入直到選擇離開或連線中斷。
        """
        try:
            # 當已連線時持續執行
            while self.client.is_connected():
                # 顯示選單
                self._print_menu()

                # 取得使用者輸入
                choice = input("請輸入選項 (1/2/3/4/5/q): ").strip().lower()

                # 根據輸入執行對應動作
                if choice == "1":
                    self.client.send_command(Command.RECYCLABLE_PLUS)
                elif choice == "2":
                    self.client.send_command(Command.NON_RECYCLABLE_PLUS)
                elif choice == "3":
                    self.client.send_command(Command.RECYCLABLE_MINUS)
                elif choice == "4":
                    self.client.send_command(Command.NON_RECYCLABLE_MINUS)
                elif choice == "5":
                    self.client.send_command(Command.RESET)
                elif choice == "q":
                    # 離開
                    print("\n[系統] 正在關閉連線...")
                    break
                else:
                    print("\n[錯誤] 無效的選項，請重新輸入。")

        except KeyboardInterrupt:
            # 處理 Ctrl+C 中斷
            print("\n\n[系統] 收到鍵盤中斷訊號")
        except EOFError:
            # 處理輸入關閉
            print("\n\n[系統] 輸入已關閉")

    def _print_menu(self):
        """
        顯示選單
        """
        print("\n--- 垃圾桶控制台 ---")
        print("請選擇要發送的指令:")
        print("  1: +1 可回收")
        print("  2: +1 不可回收")
        print("  3: -1 可回收")
        print("  4: -1 不可回收")
        print("  5: 重置計數 (reset)")
        print("  q: 離  開")


# ============================================================================
# 主程式進入點
# ============================================================================
def main():
    """
    主程式入口

    初始化 MQTT 客戶端並啟動互動式控制台。
    """
    print("正在初始化 IoT 智能車控制用戶端...")

    # 建立 IoT 客戶端
    client = IoTCarClient()

    # 連線至 MQTT Broker
    if not client.connect(timeout=10):
        print("[錯誤] 無法連線至 MQTT Broker")
        return

    # 建立並啟動互動式控制台
    console = InteractiveConsole(client)
    console.run()

    # 斷開連線
    client.disconnect()
    print("[系統] 程式已結束")


if __name__ == "__main__":
    main()
