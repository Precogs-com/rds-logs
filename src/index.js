#!/usr/bin/env node

const program = require('commander');
const AWS = require('aws-sdk');
const winston = require('winston');

const rdsLog = require('./rds-log.js');

let folderPath;

program
  .usage('[options] <path>')
  .description('Download all RDS logs on a specified database')
  .option('-i, --instance-id <aws instance identifier>', '(required) db instance identifier')
  .option('-r, --region <aws region>', '(optional) default set to us-east-1')
  .option('-d, --debug', '(optional) print debug log')
  .version('0.0.1')
  .action((path) => {
    folderPath = path;
  })
  .parse(process.argv);

if (program.debug) {
  winston.level = 'debug';
}

const instance = program.instanceId;
const region = program.region || 'us-east-1';

if (!program.args.length || typeof folderPath === 'undefined' || typeof instance === 'undefined') {
  program.help();
}

winston.debug(`Get logs for instance ${instance} on region ${region}`);
winston.debug(`Logs will be stored in ${folderPath}`);

AWS.config.update({ region });

rdsLog.getLogs(folderPath, instance, winston)
  .then(() => {
    winston.debug(`All log files retireved for instance ${instance} on region ${region}`);
  })
  .catch(winston.error);
