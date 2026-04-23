// js/tool/shell.js
const { spawn } = require('child_process');

class Shell {
    constructor(command) {
        if (!command) {
            if (process.platform === 'win32') {
                command = 'cmd.exe';
            } else if (process.platform === 'darwin' || process.platform === 'linux') {
                command = '/bin/sh';  // 或改成 /bin/sh 更通用
            } else {
                throw new Error(`不支援的平台: ${process.platform}`);
            }
        }
        
        this.process = spawn(command, [], {
            stdio: 'pipe',
            shell: true,
            windowsHide: true
        });

        this.stdout = '';
        this.stderr = '';
        this.busy = false;

        this.buffer = '';

        this.process.stdout.on('data', (data) => {
            this.buffer += data.toString();
        });

        this.process.stderr.on('data', (data) => {
            this.stderr += data.toString();
        });
    }

    async exec(commandString) {
        while (this.busy) {
            await new Promise(resolve => setTimeout(resolve, 50));
        }

        this.busy = true;
        this.stdout = '';
        this.stderr = '';
        this.buffer = '';

        this.process.stdin.write(`${commandString}\n`);

        // 動態等輸出穩定再回傳
        await this._waitForStableOutput();

        this.stdout = this.buffer;
        this.busy = false;

        return {
            stdout: this.stdout.trim(),
            stderr: this.stderr.trim()
        };
    }

    _waitForStableOutput(timeout = 1500, idle = 300) {
        return new Promise(resolve => {
            let lastLength = 0;
            let idleTimer, timeoutTimer;

            const check = () => {
                if (this.buffer.length !== lastLength) {
                    lastLength = this.buffer.length;
                    clearTimeout(idleTimer);
                    idleTimer = setTimeout(resolve, idle);
                }
            };

            timeoutTimer = setTimeout(resolve, timeout);
            idleTimer = setTimeout(resolve, idle);

            const interval = setInterval(() => {
                check();
            }, 50);

            idleTimer = setTimeout(() => {
                clearInterval(interval);
                resolve();
            }, idle);

            timeoutTimer = setTimeout(() => {
                clearInterval(interval);
                resolve();
            }, timeout);
        });
    }

    close() {
        this.process.stdin.end();
        this.process.kill();
    }
}

module.exports = Shell;
