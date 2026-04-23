// js/tool/log.js
const { createLogger, format, transports } = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const { Signale } = require('signale');
const path = require('path');

// 自訂 log levels
const customLevels = {
  levels: {
    error: 0,
    warn: 1,
    success: 2,
    info: 3,
    debug: 4
  },
  colors: {
    error: 'red',
    warn: 'yellow',
    success: 'green',
    info: 'blue',
    debug: 'grey'
  }
};

const logFormat = format.combine(
  format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  format.printf(Info => `${Info.timestamp} [${Info.level.toUpperCase()}]: ${Info.message}`)
);

const logger = createLogger({
  levels: customLevels.levels,
  format: logFormat,
  transports: [
    new DailyRotateFile({
      filename: path.join(__dirname, '../log/error/error-%DATE%.log'),
      level: 'error',
      datePattern: 'YYYY-MM-DD',
      maxSize:'10m',
      maxFiles: '30d',
      format: format((info) => info.level === 'error' ? info : false)()
    }),
    new DailyRotateFile({
      filename: path.join(__dirname, '../log/success/success-%DATE%.log'),
      level: 'success',
      datePattern: 'YYYY-MM-DD',
      maxSize:'10m',
      maxFiles: '30d',
      format: format((info) => info.level === 'success' ? info : false)()
    }),
    new DailyRotateFile({
      filename: path.join(__dirname, '../log/info/info-%DATE%.log'),
      level: 'info',
      datePattern: 'YYYY-MM-DD',
      maxSize:'10m',
      maxFiles: '',
      format: format((info) => info.level === 'info' ? info : false)()
    })
  ]
});

const signale = new Signale({ scope: 'App' });

function info(msg) {
  signale.info(msg);
  logger.info(msg);
}

function error(msg) {
  signale.error(msg);
  logger.error(msg);
}

function success(msg) {
  signale.success(msg);
  logger.success(msg);
}

function warn(msg) {
  signale.warn(msg);
  logger.warn(msg);
}

function debug(msg) {
  signale.debug(msg);
  logger.debug(msg);
}

module.exports = { 
    info, 
    error, 
    success, 
    warn, 
    debug
};