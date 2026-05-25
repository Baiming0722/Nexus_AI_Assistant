#include <Arduino.h>
#ifndef min
#define min(a, b) ((a) < (b) ? (a) : (b))
#endif
#ifndef max
#define max(a, b) ((a) > (b) ? (a) : (b))
#endif
#include <HUSKYLENS.h>
#undef min
#undef max
#include <PubSubClient.h>
#include <WebServer.h>
#include <WiFi.h>
#include <Wire.h>

static const char WIFI_SSID[] = "Internet";
static const char WIFI_PASSWORD[] = "48216114";

static const char MQTT_HOST[] = "broker.emqx.io";
static const uint16_t MQTT_PORT = 1883;
static const char MQTT_CLIENT_ID[] = "smart-trash-bin-01";
static const char MQTT_TOPIC_COMMAND[] = "trashbin/command";
static const char MQTT_TOPIC_STATUS[] = "trashbin/status";
static const char MQTT_TOPIC_EVENT[] = "trashbin/event";
static const char MQTT_TOPIC_ALERT[] = "trashbin/alert";

static const int FULL_THRESHOLD = 5;
static const int HUSKYLENS_SDA_PIN = 21;
static const int HUSKYLENS_SCL_PIN = 22;
static const int ULTRASONIC_TRIG_PIN = 17;
static const int ULTRASONIC_ECHO_PIN = 16;
static const float ULTRASONIC_OBJECT_DISTANCE_CM = 12.0f;
static const unsigned long HUSKYLENS_POLL_INTERVAL_MS = 150;
static const unsigned long DETECTION_COOLDOWN_MS = 5000;
static const unsigned long ULTRASONIC_POLL_INTERVAL_MS = 250;
static const unsigned long ULTRASONIC_FULL_DELAY_MS = 10000;

WiFiClient wifiClient;
PubSubClient mqttClient(wifiClient);
WebServer server(80);
HUSKYLENS huskylens;

int recyclableCount = 0;
int nonRecyclableCount = 0;
bool alertActive = false;
int lastId = 3;
char lastCategory[24] = "blank";
char lastCategoryZh[24] = "空白";
char lastUpdate[16] = "--:--:--";
char statusBuffer[768];
char eventBuffer[384];
char assistantMessage[256] = "目前畫面為空白，請將垃圾放到 HUSKYLENS 前方進行辨識。";
char htmlBuffer[14000];

unsigned long lastHuskyPollAt = 0;
unsigned long lastValidDetectionAt = 0;
unsigned long lastUltrasonicPollAt = 0;
unsigned long ultrasonicOccupiedSince = 0;
float lastDistanceCm = -1.0f;
bool ultrasonicObjectPresent = false;
bool ultrasonicTimeoutAlert = false;

void updateTimeString(void)
{
  unsigned long totalSeconds = millis() / 1000UL;
  unsigned long hours = (totalSeconds / 3600UL) % 24UL;
  unsigned long minutes = (totalSeconds / 60UL) % 60UL;
  unsigned long seconds = totalSeconds % 60UL;
  snprintf(lastUpdate, sizeof(lastUpdate), "%02lu:%02lu:%02lu", hours, minutes, seconds);
}

int totalCount(void)
{
  return recyclableCount + nonRecyclableCount;
}

int maxCount(void)
{
  return recyclableCount > nonRecyclableCount ? recyclableCount : nonRecyclableCount;
}

int fillPercent(void)
{
  int percent = (maxCount() * 100) / FULL_THRESHOLD;
  return percent > 100 ? 100 : percent;
}

bool isBinFull(void)
{
  return (maxCount() >= FULL_THRESHOLD) || ultrasonicTimeoutAlert;
}

const char *fullBucketText(void)
{
  if (ultrasonicTimeoutAlert)
  {
    return "ultrasonic_timeout";
  }
  if (recyclableCount >= FULL_THRESHOLD)
  {
    return "可回收桶";
  }
  if (nonRecyclableCount >= FULL_THRESHOLD)
  {
    return "不可回收桶";
  }
  return "無";
}

const char *topCategoryText(void)
{
  if (totalCount() == 0)
  {
    return "尚無資料";
  }
  return recyclableCount >= nonRecyclableCount ? "可回收" : "不可回收";
}

const char *categoryKeyFromId(int id)
{
  switch (id)
  {
  case 1:
    return "recyclable";
  case 2:
    return "non_recyclable";
  case 3:
    return "blank";
  default:
    return "unknown";
  }
}

const char *categoryZhFromId(int id)
{
  switch (id)
  {
  case 1:
    return "可回收";
  case 2:
    return "不可回收";
  case 3:
    return "空白";
  default:
    return "未知 ID";
  }
}

const char *targetBinFromId(int id)
{
  switch (id)
  {
  case 1:
    return "可回收桶";
  case 2:
    return "不可回收桶";
  case 3:
    return "無";
  default:
    return "待確認";
  }
}

void buildAssistantMessage(int detectedId)
{
  if (detectedId == 1)
  {
    snprintf(
        assistantMessage,
        sizeof(assistantMessage),
        "目前辨識到可回收垃圾，請投入可回收桶。今日可回收已累計 %d 件，目前桶量約 %d%%。",
        recyclableCount,
        fillPercent());
  }
  else if (detectedId == 2)
  {
    snprintf(
        assistantMessage,
        sizeof(assistantMessage),
        "目前辨識到不可回收垃圾，請投入不可回收桶。今日不可回收已累計 %d 件，目前桶量約 %d%%。",
        nonRecyclableCount,
        fillPercent());
  }
  else if (detectedId == 3)
  {
    snprintf(
        assistantMessage,
        sizeof(assistantMessage),
        "目前畫面為空白，尚未偵測到需要分類的垃圾。");
    return;
  }
  else
  {
    snprintf(
        assistantMessage,
        sizeof(assistantMessage),
        "HUSKYLENS 偵測到未設定的 ID %d，請確認模型訓練或程式對應。",
        detectedId);
  }

  if (isBinFull())
  {
    snprintf(
        assistantMessage,
        sizeof(assistantMessage),
        "目前 %s 已達 %d%%，建議清空後再繼續展示。今日投入最多的是%s垃圾。",
        fullBucketText(),
        fillPercent(),
        topCategoryText());
  }
}

const char *buildStatusJson(void)
{
  snprintf(
      statusBuffer,
      sizeof(statusBuffer),
      "{\"id\":%d,\"category\":\"%s\",\"category_zh\":\"%s\",\"target_bin\":\"%s\",\"time\":\"%s\",\"recyclable\":%d,\"non_recyclable\":%d,\"total\":%d,\"fill_percent\":%d,\"full\":%s,\"full_bucket\":\"%s\",\"top_category\":\"%s\",\"message\":\"%s\",\"distance_cm\":%.2f,\"object_present\":%s,\"ultrasonic_full\":%s}",
      lastId,
      lastCategory,
      lastCategoryZh,
      targetBinFromId(lastId),
      lastUpdate,
      recyclableCount,
      nonRecyclableCount,
      totalCount(),
      fillPercent(),
      isBinFull() ? "true" : "false",
      fullBucketText(),
      topCategoryText(),
      assistantMessage,
      lastDistanceCm,
      ultrasonicObjectPresent ? "true" : "false",
      ultrasonicTimeoutAlert ? "true" : "false");
  return statusBuffer;
}

void publishStatus(void)
{
  mqttClient.publish(MQTT_TOPIC_STATUS, buildStatusJson(), true);
}

void publishAlertIfNeeded(void)
{
  bool shouldAlert = isBinFull();
  if (shouldAlert && !alertActive)
  {
    alertActive = true;
    const char *alertMessage = ultrasonicTimeoutAlert ? "垃圾桶滿了：超音波感測器連續偵測到物體超過15秒" : assistantMessage;
    mqttClient.publish(MQTT_TOPIC_ALERT, alertMessage, true);
  }
  else if (!shouldAlert && alertActive)
  {
    alertActive = false;
    mqttClient.publish(MQTT_TOPIC_ALERT, "垃圾桶狀態已恢復正常。", true);
  }
}

void refreshStatus(void)
{
  updateTimeString();
  publishAlertIfNeeded();
  publishStatus();
}

float readUltrasonicDistanceCm(void)
{
  digitalWrite(ULTRASONIC_TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(ULTRASONIC_TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(ULTRASONIC_TRIG_PIN, LOW);

  unsigned long duration = pulseIn(ULTRASONIC_ECHO_PIN, HIGH, 30000UL);
  if (duration == 0)
  {
    return -1.0f;
  }

  return (duration * 0.0343f) / 2.0f;
}

void updateUltrasonicState(void)
{
  if (millis() - lastUltrasonicPollAt < ULTRASONIC_POLL_INTERVAL_MS)
  {
    return;
  }
  lastUltrasonicPollAt = millis();

  float distanceCm = readUltrasonicDistanceCm();
  lastDistanceCm = distanceCm;

  bool objectPresent = (distanceCm > 0.0f) && (distanceCm <= ULTRASONIC_OBJECT_DISTANCE_CM);
  bool previousObjectPresent = ultrasonicObjectPresent;
  bool previousTimeoutAlert = ultrasonicTimeoutAlert;

  ultrasonicObjectPresent = objectPresent;

  if (objectPresent)
  {
    if (ultrasonicOccupiedSince == 0)
    {
      ultrasonicOccupiedSince = millis();
    }

    if ((millis() - ultrasonicOccupiedSince >= ULTRASONIC_FULL_DELAY_MS) && !ultrasonicTimeoutAlert)
    {
      ultrasonicTimeoutAlert = true;
      snprintf(
          assistantMessage,
          sizeof(assistantMessage),
          "超音波感測器連續偵測到物體超過15秒，判定垃圾桶已滿。");
    }
  }
  else
  {
    ultrasonicOccupiedSince = 0;
    ultrasonicTimeoutAlert = false;
  }

  if ((previousObjectPresent != ultrasonicObjectPresent) || (previousTimeoutAlert != ultrasonicTimeoutAlert))
  {
    refreshStatus();
  }
}

void publishEvent(int id)
{
  snprintf(
      eventBuffer,
      sizeof(eventBuffer),
      "{\"id\":%d,\"category\":\"%s\",\"category_zh\":\"%s\",\"target_bin\":\"%s\",\"time\":\"%s\",\"count\":%d,\"full\":%s}",
      id,
      categoryKeyFromId(id),
      categoryZhFromId(id),
      targetBinFromId(id),
      lastUpdate,
      totalCount(),
      isBinFull() ? "true" : "false");
  mqttClient.publish(MQTT_TOPIC_EVENT, eventBuffer, false);
}

void recordDetection(int id, const char *source)
{
  lastId = id;
  strncpy(lastCategory, categoryKeyFromId(id), sizeof(lastCategory) - 1);
  lastCategory[sizeof(lastCategory) - 1] = '\0';
  strncpy(lastCategoryZh, categoryZhFromId(id), sizeof(lastCategoryZh) - 1);
  lastCategoryZh[sizeof(lastCategoryZh) - 1] = '\0';

  if (id == 1)
  {
    recyclableCount++;
  }
  else if (id == 2)
  {
    nonRecyclableCount++;
  }

  updateTimeString();
  buildAssistantMessage(id);
  publishAlertIfNeeded();
  publishStatus();

  if (id != 3)
  {
    publishEvent(id);
  }

  Serial.print("Detection from ");
  Serial.print(source);
  Serial.print(": ID=");
  Serial.print(id);
  Serial.print(", category=");
  Serial.println(lastCategory);
}

void resetCounters(void)
{
  recyclableCount = 0;
  nonRecyclableCount = 0;
  alertActive = false;
  lastId = 3;
  strncpy(lastCategory, "blank", sizeof(lastCategory));
  strncpy(lastCategoryZh, "空白", sizeof(lastCategoryZh));
  snprintf(assistantMessage, sizeof(assistantMessage), "統計已重設。請將垃圾放到 HUSKYLENS 前方開始辨識。");
  refreshStatus();
  mqttClient.publish(MQTT_TOPIC_ALERT, "垃圾桶狀態已重設。", true);
}

void handleRoot(void)
{
  const char *statusText = isBinFull() ? "滿桶" : "正常";
  const char *statusClass = isBinFull() ? "danger" : "ok";
  const char *mqttText = mqttClient.connected() ? "connected" : "disconnected";

  snprintf(htmlBuffer, sizeof(htmlBuffer), R"HTML(
<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AI 智慧垃圾辨識 Dashboard</title>
  <style>
    :root {
      --bg: #f6f7f2;
      --panel: #ffffff;
      --text: #26302d;
      --muted: #67736f;
      --line: #dfe5df;
      --green: #2f9b62;
      --red: #d94d42;
      --blue: #2e76b8;
      --shadow: rgba(34, 48, 42, 0.12);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: "Microsoft JhengHei", "Segoe UI", Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
    }
    .wrap {
      width: min(900px, 100%%);
      margin: 0 auto;
      padding: 22px 14px 30px;
    }
    header {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      gap: 16px;
      margin-bottom: 18px;
    }
    h1 {
      margin: 0;
      font-size: clamp(24px, 4vw, 38px);
    }
    .sub {
      color: var(--muted);
      font-weight: 700;
      margin-top: 6px;
    }
    .pill {
      padding: 9px 12px;
      border-radius: 999px;
      background: #e8eee9;
      color: var(--muted);
      font-size: 14px;
      font-weight: 800;
      white-space: nowrap;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
      margin-bottom: 12px;
    }
    .card, .assistant, .panel {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      box-shadow: 0 12px 24px var(--shadow);
    }
    .card {
      padding: 16px;
      min-height: 128px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .label {
      color: var(--muted);
      font-size: 14px;
      font-weight: 800;
    }
    .value {
      font-size: 34px;
      line-height: 1;
      font-weight: 900;
      margin-top: 12px;
    }
    .hint {
      color: var(--muted);
      font-size: 13px;
      font-weight: 700;
      margin-top: 10px;
    }
    .accent-green { border-top: 5px solid var(--green); }
    .accent-red { border-top: 5px solid var(--red); }
    .accent-blue { border-top: 5px solid var(--blue); }
    .main {
      display: grid;
      grid-template-columns: 1.2fr 0.8fr;
      gap: 12px;
    }
    .assistant, .panel { padding: 20px; }
    .assistant h2, .panel h2 {
      margin: 0 0 14px;
      font-size: 20px;
    }
    .message {
      font-size: 24px;
      line-height: 1.45;
      font-weight: 850;
    }
    .status {
      display: inline-flex;
      padding: 9px 12px;
      border-radius: 999px;
      color: #ffffff;
      font-weight: 900;
      margin-top: 18px;
    }
    .status.ok { background: var(--green); }
    .status.danger { background: var(--red); }
    .row {
      display: flex;
      justify-content: space-between;
      gap: 14px;
      border-bottom: 1px solid var(--line);
      padding: 11px 0;
      font-size: 15px;
      font-weight: 800;
    }
    .row:last-child { border-bottom: 0; }
    .key { color: var(--muted); }
    .val { text-align: right; word-break: break-word; }
    .bar {
      height: 12px;
      background: #e8eee9;
      border-radius: 99px;
      overflow: hidden;
      margin-top: 12px;
    }
    .bar span {
      display: block;
      height: 100%%;
      width: %d%%;
      background: %s;
    }
    .actions {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 10px;
      margin-top: 12px;
    }
    button {
      border: 0;
      border-radius: 8px;
      padding: 13px 10px;
      background: #23302b;
      color: #ffffff;
      font-weight: 900;
      cursor: pointer;
    }
    button.secondary { background: #e8eee9; color: #26302d; }
    @media (max-width: 760px) {
      header, .main { display: block; }
      .grid { grid-template-columns: 1fr; }
      .panel { margin-top: 12px; }
      .actions { grid-template-columns: 1fr 1fr; }
      .message { font-size: 21px; }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <header>
      <div>
        <h1>AI 智慧垃圾辨識</h1>
        <div class="sub">ID 1 可回收｜ID 2 不可回收｜ID 3 空白</div>
      </div>
      <div class="pill">Updated %s</div>
    </header>

    <section class="grid">
      <div class="card accent-green">
        <div class="label">可回收</div>
        <div class="value">%d</div>
        <div class="hint">HUSKYLENS ID 1</div>
      </div>
      <div class="card accent-red">
        <div class="label">不可回收</div>
        <div class="value">%d</div>
        <div class="hint">HUSKYLENS ID 2</div>
      </div>
      <div class="card accent-blue">
        <div class="label">今日總數</div>
        <div class="value">%d</div>
        <div class="hint">最多：%s</div>
      </div>
    </section>

    <section class="main">
      <div class="assistant">
        <h2>LLM 自然語言提示</h2>
        <div class="message">%s</div>
        <div class="status %s">桶狀態：%s，容量約 %d%%</div>
        <div class="bar"><span></span></div>
      </div>

      <div class="panel">
        <h2>即時資訊</h2>
        <div class="row"><span class="key">最後 ID</span><span class="val">%d</span></div>
        <div class="row"><span class="key">最後辨識</span><span class="val">%s</span></div>
        <div class="row"><span class="key">建議桶別</span><span class="val">%s</span></div>
        <div class="row"><span class="key">滿桶位置</span><span class="val">%s</span></div>
        <div class="row"><span class="key">Wi-Fi IP</span><span class="val">%s</span></div>
        <div class="row"><span class="key">MQTT</span><span class="val">%s</span></div>
      </div>
    </section>

    <div class="actions">
      <button onclick="sendCommand('recyclable+1')">測試 ID 1</button>
      <button onclick="sendCommand('nonrecyclable+1')">測試 ID 2</button>
      <button onclick="sendCommand('blank')">測試 ID 3</button>
      <button class="secondary" onclick="sendCommand('reset')">重設</button>
    </div>
  </div>
  <script>
    async function sendCommand(command) {
      await fetch('/command?cmd=' + encodeURIComponent(command));
      location.reload();
    }
    setTimeout(function () { location.reload(); }, 2500);
  </script>
</body>
</html>
)HTML",
           fillPercent(),
           isBinFull() ? "var(--red)" : "var(--green)",
           lastUpdate,
           recyclableCount,
           nonRecyclableCount,
           totalCount(),
           topCategoryText(),
           assistantMessage,
           statusClass,
           statusText,
           fillPercent(),
           lastId,
           lastCategoryZh,
           targetBinFromId(lastId),
           fullBucketText(),
           WiFi.localIP().toString().c_str(),
           mqttText);

  server.sendHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  server.sendHeader("Pragma", "no-cache");
  server.sendHeader("Expires", "0");
  server.send(200, "text/html; charset=utf-8", htmlBuffer);
}

void handleStatus(void)
{
  refreshStatus();
  server.sendHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  server.send(200, "application/json; charset=utf-8", buildStatusJson());
}

void processCommand(const char *command, const char *source)
{
  char cleanCommand[64];
  size_t i = 0;
  size_t j = 0;

  while ((command[i] == ' ') || (command[i] == '\r') || (command[i] == '\n') || (command[i] == '\t'))
  {
    i++;
  }

  for (; (command[i] != '\0') && (j < sizeof(cleanCommand) - 1); i++)
  {
    if ((command[i] == '\r') || (command[i] == '\n'))
    {
      break;
    }
    cleanCommand[j++] = command[i];
  }
  cleanCommand[j] = '\0';

  if ((strcmp(cleanCommand, "recyclable+1") == 0) || (strcmp(cleanCommand, "id1") == 0))
  {
    recordDetection(1, source);
  }
  else if ((strcmp(cleanCommand, "nonrecyclable+1") == 0) || (strcmp(cleanCommand, "non_recyclable+1") == 0) || (strcmp(cleanCommand, "id2") == 0))
  {
    recordDetection(2, source);
  }
  else if ((strcmp(cleanCommand, "blank") == 0) || (strcmp(cleanCommand, "id3") == 0))
  {
    recordDetection(3, source);
  }
  else if (strcmp(cleanCommand, "reset") == 0)
  {
    resetCounters();
  }
  else
  {
    Serial.print("Command not recognized: ");
    Serial.println(cleanCommand);
  }
}

void handleCommand(void)
{
  if (!server.hasArg("cmd"))
  {
    server.send(400, "text/plain; charset=utf-8", "Missing cmd");
    return;
  }

  processCommand(server.arg("cmd").c_str(), "web");
  server.send(200, "application/json; charset=utf-8", buildStatusJson());
}

void handleNotFound(void)
{
  server.send(404, "text/plain; charset=utf-8", "Not found");
}

void connectWiFi(void)
{
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  Serial.print("Connecting to Wi-Fi");
  while (WiFi.status() != WL_CONNECTED)
  {
    delay(500);
    Serial.print(".");
  }

  Serial.println();
  Serial.print("Wi-Fi connected, IP: ");
  Serial.println(WiFi.localIP());
}

void mqttCallback(char *topic, byte *payload, unsigned int length)
{
  char message[64];
  unsigned int copyLength = length;
  if (copyLength >= sizeof(message))
  {
    copyLength = sizeof(message) - 1;
  }

  memcpy(message, payload, copyLength);
  message[copyLength] = '\0';

  Serial.print("MQTT topic: ");
  Serial.println(topic);
  Serial.print("MQTT payload: ");
  Serial.println(message);

  processCommand(message, "mqtt");
}

void connectMQTT(void)
{
  mqttClient.setServer(MQTT_HOST, MQTT_PORT);
  mqttClient.setCallback(mqttCallback);
  mqttClient.setBufferSize(1024);

  while (!mqttClient.connected())
  {
    Serial.print("Connecting to MQTT broker...");
    if (mqttClient.connect(MQTT_CLIENT_ID))
    {
      Serial.println("connected");
      mqttClient.subscribe(MQTT_TOPIC_COMMAND);
      publishStatus();
    }
    else
    {
      Serial.print("failed, rc=");
      Serial.print(mqttClient.state());
      Serial.println(" retrying in 3 seconds");
      delay(3000);
    }
  }
}

void setupWebServer(void)
{
  server.on("/", handleRoot);
  server.on("/status", handleStatus);
  server.on("/command", handleCommand);
  server.onNotFound(handleNotFound);
  server.begin();
  Serial.println("HTTP server started");
}

void setupHuskyLens(void)
{
  Wire.begin(HUSKYLENS_SDA_PIN, HUSKYLENS_SCL_PIN);

  while (!huskylens.begin(Wire))
  {
    Serial.println("HUSKYLENS connection failed, retrying...");
    delay(1000);
  }

  huskylens.writeAlgorithm(ALGORITHM_OBJECT_RECOGNITION);
  Serial.println("HUSKYLENS connected");
}

void setupUltrasonic(void)
{
  pinMode(ULTRASONIC_TRIG_PIN, OUTPUT);
  pinMode(ULTRASONIC_ECHO_PIN, INPUT);
  digitalWrite(ULTRASONIC_TRIG_PIN, LOW);
  Serial.println("HC-SR04 ultrasonic sensor ready");
}

void handleHuskyLens(void)
{
  if (millis() - lastHuskyPollAt < HUSKYLENS_POLL_INTERVAL_MS)
  {
    return;
  }
  lastHuskyPollAt = millis();

  if (!huskylens.request())
  {
    Serial.println("HUSKYLENS request failed");
    return;
  }

  if (!huskylens.available())
  {
    return;
  }

  HUSKYLENSResult result = huskylens.read();

  if ((result.ID == 1) || (result.ID == 2))
  {
    if (millis() - lastValidDetectionAt < DETECTION_COOLDOWN_MS)
    {
      return;
    }
    lastValidDetectionAt = millis();
    recordDetection(result.ID, "huskylens");
    return;
  }

  if (result.ID == 3)
  {
    recordDetection(3, "huskylens");
    return;
  }

  Serial.print("Unsupported HUSKYLENS ID: ");
  Serial.println(result.ID);
}

void setup(void)
{
  Serial.begin(115200);
  delay(1000);

  updateTimeString();
  setupUltrasonic();
  setupHuskyLens();
  connectWiFi();
  setupWebServer();
  connectMQTT();
  refreshStatus();
}

void loop(void)
{
  if (WiFi.status() != WL_CONNECTED)
  {
    connectWiFi();
  }

  if (!mqttClient.connected())
  {
    connectMQTT();
  }

  updateUltrasonicState();
  handleHuskyLens();
  server.handleClient();
  mqttClient.loop();
}
