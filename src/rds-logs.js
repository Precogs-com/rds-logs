const Promise = require('bluebird');
const fs = require('fs-extra');
const https = require('https');
const path = require('path');
const AWS = require('aws-sdk');
const aws4 = require('aws4');
const winston = require('winston');

let logger;
let rds;

/**
 * Retrieve complete log file from AWS REST API
 *
 * @see https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/RESTReference.html
 * @see https://github.com/munisystem/kuroneko/blob/c38d26950984eb55a0e464070fddc0c1d84521a4/src/index.js
 *
 * @param  {String} folderPath Path to logs folder
 * @param  {String} instanceId RDS instance id
 * @param  {String} filename   File to retrieve
 * @return {String}            File location
 */
const downloadCompleteLogFile = (folderPath, instanceId, filename) => {
  // Get parameters to sign request
  const opts = aws4.sign({
    service: 'rds',
    path: `/v13/downloadCompleteLogFile/${instanceId}/${filename}`,
    region: rds.config.region,
  }, {
    accessKeyId: rds.config.credentials.accessKeyId,
    secretAccessKey: rds.config.credentials.secretAccessKey,
    sessionToken: rds.config.credentials.sessionToken,
  });

  // Get data from AWS REST API
  return new Promise((resolve, reject) => {
    const req = https.request(opts, (res) => {
      logger.debug(`Start to retrieve <${filename}>`);

      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        if (res.statusCode !== 200) {
          return reject(new Error(body));
        }

        try {
          logger.debug(`<${filename}> retrieved`);
          const filepath = path.resolve(path.join(folderPath, filename.concat('.log')));
          fs.ensureFileSync(filepath);
          fs.writeFileSync(filepath, body);
          logger.info(`File <${filepath}> created`);
          return resolve(filepath);
        } catch (err) {
          return reject(err);
        }
      });
    });
    req.end();
    req.on('err', reject);
  });
};

/**
 * Get logs files list for a specific instance
 *
 * @param  {String}   instanceId  RDS instance id
 * @return {Object[]}             List of all available files
 */
const listLogs = (instanceId) => {
  logger.debug(`Get logs list on instance ${instanceId}`);
  const params = {
    DBInstanceIdentifier: instanceId,
  };

  return rds.describeDBLogFiles(params).promise()
    .then(data => data.DescribeDBLogFiles);
};

/**
 * Get all logs files from a specific RDS instance and store them in a given folder.
 *
 * @param  {String}   folderPath  Path to logs folder
 * @param  {String}   instanceId  RDS instance id
 * @param  {Object}   plog        Logger. Should contain at least <debug> and <info> level
 * @return {String[]}             List of all logs files location
 */
const getLogs = (folderPath, instanceId, plog) => new Promise((resolve, reject) => {
  try {
    if (plog &&
      typeof plog.debug === 'function' &&
      typeof plog.info === 'function' &&
      typeof plog.error === 'function') {
      logger = plog;
    } else {
      logger = winston;
    }

    if (typeof folderPath === 'undefined') {
      throw new Error('Folder path is not defined\n');
    }

    if (typeof instanceId === 'undefined') {
      throw new Error('Instance ID is not defined\n');
    }

    logger.debug(`Create <${folderPath}> if nos exist`);
    fs.ensureDirSync(folderPath);
    rds = new AWS.RDS({ apiVersion: '2014-10-31' });

    listLogs(instanceId)
      // Using mapSeries to avoid concurrency.
      // I don't really know why, but when all requests are made at the time (eg Promise.all)
      // some data in files are not retrieve.
      .then(logs => Promise.mapSeries(logs, (log) => {
        const filename = log.LogFileName;
        return downloadCompleteLogFile(folderPath, instanceId, filename)
          .catch(err => logger.error(`Cannot retrieve file <${filename}>.\nerror:${err}\n`));
      }))
      .then(resolve)
      .catch((err) => {
        logger.error(`Cannot retrieve logs on instance <${instanceId}>`);
        reject(err);
      });
  } catch (err) {
    logger.error(`Failed to retrieve logs.\nerror: ${err}`);
    reject(err);
  }
});

module.exports = {
  getLogs,
};
