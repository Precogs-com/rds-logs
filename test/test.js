'use strict';

const sinon = require('sinon');
const proxyquire = require('proxyquire').noCallThru();
const https = require('https');

const stream = require('stream');
const chai = require('chai');

describe('rds-logs', () => {
  let rdsLogWithStubs;
  let stubDescribeDBLogFiles;
  let stubPromiseDescribeDBLogFiles;
  let stubAws4;
  let stubWinston;
  let stubFs;
  let stubHttpsRequest;
  let rdsConfig;

  beforeEach(() => {
    stubWinston = {
      info: sinon.stub().returns(),
      debug: sinon.stub().returns(),
      error: sinon.stub().returns(),
    };

    stubFs = {
      ensureDirSync: sinon.stub().returns(),
      ensureFileSync: sinon.stub().returns(),
      writeFileSync: sinon.stub().returns(),
    };

    stubDescribeDBLogFiles = sinon.stub().resolves({
      ResponseMetadata: { RequestId: 'cf0daca0-e637-4f91-bb3d-42827d8b6926' },
      DescribeDBLogFiles:
        [
          {
            LogFileName: 'error/postgresql.log.2018-01-12-12',
            LastWritten: 1515761819000,
            Size: 38528,
          },
        ],
    });
    stubPromiseDescribeDBLogFiles = sinon.stub().returns({
      promise: stubDescribeDBLogFiles,
    });

    stubAws4 = {
      sign: sinon.stub(),
    };

    rdsConfig = {
      region: 'us-east-1',
      credentials: {
        accessKeyId: 'accessKeyId',
        secretAccessKey: 'secretAccessKey',
        sessionToken: 'sessionToken',
      },
    };

    rdsLogWithStubs = proxyquire('../src/rds-logs', {
      winston: stubWinston,
      'fs-extra': stubFs,
      aws4: stubAws4,
      'aws-sdk': {
        RDS: sinon.stub().returns({
          describeDBLogFiles: stubPromiseDescribeDBLogFiles,
          config: rdsConfig,
        }),
      },
    });

    stubHttpsRequest = sinon.stub(https, 'request');
    stubHttpsRequest.returns({
      end: 'toto',
    });
  });

  afterEach(() => {
    stubHttpsRequest.restore();
  });

  it('should fail if folder path is undefined', (done) => {
    rdsLogWithStubs.getLogs(undefined, 'b')
      .then((res) => {
        done(`Should not success.\ndata: ${res}`);
      })
      .catch((err) => {
        chai.expect(stubWinston.debug.callCount).to.equal(0);
        chai.expect(stubWinston.info.callCount).to.equal(0);
        chai.expect(stubWinston.error.callCount).to.equal(1);
        chai.expect(err.message).to.equal('Folder path is not defined\n');
        done();
      });
  });

  it('should fail if instance ID is undefined', (done) => {
    rdsLogWithStubs.getLogs('a', undefined)
      .then((res) => {
        done(`Should not success.\ndata: ${res}`);
      })
      .catch((err) => {
        chai.expect(stubWinston.debug.callCount).to.equal(0);
        chai.expect(stubWinston.info.callCount).to.equal(0);
        chai.expect(stubWinston.error.callCount).to.equal(1);
        chai.expect(err.message).to.equal('Instance ID is not defined\n');
        done();
      });
  });

  it('should fail if folder path and instance ID are undefined', (done) => {
    rdsLogWithStubs.getLogs(undefined, undefined)
      .then((res) => {
        done(`Should not success.\ndata: ${res}`);
      })
      .catch((err) => {
        chai.expect(stubWinston.debug.callCount).to.equal(0);
        chai.expect(stubWinston.info.callCount).to.equal(0);
        chai.expect(stubWinston.error.callCount).to.equal(1);
        chai.expect(err.message).to.equal('Folder path is not defined\n');
        done();
      });
  });

  it('should fail if ensureDirSync throw an error', (done) => {
    stubFs.ensureDirSync.throws(new Error('Oh no ensureDirSync!'));
    const folderPath = '.';
    rdsLogWithStubs.getLogs(folderPath, 'id')
      .then((res) => {
        done(`Should not success.\ndata: ${res}`);
      })
      .catch((err) => {
        try {
          chai.expect(stubWinston.debug.callCount).to.equal(1);
          chai.expect(stubWinston.info.callCount).to.equal(0);
          chai.expect(stubWinston.error.callCount).to.equal(1);
          chai.expect(stubFs.ensureDirSync.callCount).to.equal(1);
          chai.expect(stubFs.ensureDirSync.firstCall.args[0]).to.equal(folderPath);
          chai.expect(err.message).to.equal('Oh no ensureDirSync!');
          done();
        } catch (e) {
          done(e);
        }
      });
  });

  it('should fail if describeDBLogFiles throw an error', (done) => {
    stubDescribeDBLogFiles.rejects(new Error('Oh no stubDescribeDBLogFiles!'));
    const folderPath = '.';
    const instanceId = 'id';
    rdsLogWithStubs.getLogs(folderPath, instanceId)
      .then((res) => {
        done(`Should not success.\ndata: ${res}`);
      })
      .catch((err) => {
        try {
          chai.expect(stubWinston.debug.callCount).to.equal(2);
          chai.expect(stubWinston.info.callCount).to.equal(0);
          chai.expect(stubWinston.error.callCount).to.equal(1);
          chai.expect(stubFs.ensureDirSync.firstCall.args[0]).to.equal(folderPath);
          chai.expect(stubDescribeDBLogFiles.callCount).to.equal(1);
          chai.expect(stubPromiseDescribeDBLogFiles.callCount).to.equal(1);
          chai.expect(stubPromiseDescribeDBLogFiles.firstCall.args[0])
            .to.deep.equal({ DBInstanceIdentifier: instanceId });
          chai.expect(err.message).to.equal('Oh no stubDescribeDBLogFiles!');
          done();
        } catch (e) {
          done(e);
        }
      });
  });

  it('should success even if one requested file throw an error (request)', (done) => {
    const folderPath = '.';
    const instanceId = 'id';
    stubAws4.sign.returns({});
    stubHttpsRequest.throws(new Error('Oh no stubHttpsRequest!'));

    rdsLogWithStubs.getLogs(folderPath, instanceId)
      .then(() => {
        chai.expect(stubHttpsRequest.firstCall.args[0]).to.deep.equal({});
        chai.expect(stubWinston.debug.callCount).to.equal(2);
        chai.expect(stubWinston.error.callCount).to.equal(1);
        chai.expect(stubWinston.info.callCount).to.equal(0);
        chai.expect(stubWinston.error.firstCall.args[0]).to.equal('Cannot retrieve file <error/postgresql.log.2018-01-12-12>.\nerror:Error: Oh no stubHttpsRequest!\n');
        done();
      })
      .catch(done);
  });

  it('should success even if one requested file throw an error (statusCode)', (done) => {
    const folderPath = '.';
    const instanceId = 'id';

    const opts = {
      service: 'rds',
      path: `/v13/downloadCompleteLogFile/${instanceId}/error/postgresql.log.2018-01-12-12`,
      region: 'us-east-1',
      headers: {
        Host: 'rds.us-east-1.amazonaws.com',
        'X-Amz-Date': '20180115T134531Z',
        Authorization: 'AWS4-HMAC-SHA256 Credential=GHIAI3QLC3MSYGBJ64IA/20180115/us-east-1/rds/aws4_request, SignedHeaders=host;x-amz-date, Signature=d649d8eef9903b4a6c8f08984a1ed1a7ceae14dd87de5f8b3802cc8f70967d5e',
      },
      hostname: 'rds.us-east-1.amazonaws.com',
    };

    stubAws4.sign.returns(opts);

    const expected = { pre: 'cogs' };
    const response = new stream.PassThrough();
    response.write(JSON.stringify(expected));
    response.statusCode = 403;
    response.end();
    const request = new stream.PassThrough();

    stubHttpsRequest.yields(response).returns(request);

    rdsLogWithStubs.getLogs(folderPath, instanceId)
      .then(() => {
        chai.expect(stubHttpsRequest.firstCall.args[0]).to.deep.equal(opts);
        chai.expect(stubWinston.debug.callCount).to.equal(3);
        chai.expect(stubWinston.error.callCount).to.equal(1);
        chai.expect(stubWinston.info.callCount).to.equal(0);
        chai.expect(stubWinston.error.firstCall.args[0]).to.equal('Cannot retrieve file <error/postgresql.log.2018-01-12-12>.\nerror:Error: {"pre":"cogs"}\n');
        done();
      })
      .catch(done);
  });

  it('should success even if one requested file throw an error (ensureFileSync)', (done) => {
    const folderPath = '.';
    const instanceId = 'id';

    stubFs.ensureFileSync.throws(new Error('Oh no ensureFileSync!'));

    const opts = {
      service: 'rds',
      path: `/v13/downloadCompleteLogFile/${instanceId}/error/postgresql.log.2018-01-12-12`,
      region: 'us-east-1',
      headers: {
        Host: 'rds.us-east-1.amazonaws.com',
        'X-Amz-Date': '20180115T134531Z',
        Authorization: 'AWS4-HMAC-SHA256 Credential=GHIAI3QLC3MSYGBJ64IA/20180115/us-east-1/rds/aws4_request, SignedHeaders=host;x-amz-date, Signature=d649d8eef9903b4a6c8f08984a1ed1a7ceae14dd87de5f8b3802cc8f70967d5e',
      },
      hostname: 'rds.us-east-1.amazonaws.com',
    };

    stubAws4.sign.returns(opts);

    const expected = { pre: 'cogs' };
    const response = new stream.PassThrough();
    response.write(JSON.stringify(expected));
    response.statusCode = 200;
    response.end();
    const request = new stream.PassThrough();

    stubHttpsRequest.yields(response).returns(request);

    rdsLogWithStubs.getLogs(folderPath, instanceId)
      .then(() => {
        chai.expect(stubHttpsRequest.firstCall.args[0]).to.deep.equal(opts);
        chai.expect(stubWinston.debug.callCount).to.equal(4);
        chai.expect(stubWinston.error.callCount).to.equal(1);
        chai.expect(stubWinston.info.callCount).to.equal(0);
        chai.expect(stubFs.ensureFileSync.callCount).to.equal(1);
        chai.expect(stubFs.ensureFileSync.firstCall.args[0]).to.match(/\w*postgresql\.log\.2018-01-12-12\.log\b/);
        chai.expect(stubWinston.error.firstCall.args[0]).to.equal('Cannot retrieve file <error/postgresql.log.2018-01-12-12>.\nerror:Error: Oh no ensureFileSync!\n');
        done();
      })
      .catch(done);
  });

  it('should success even if one requested file throw an error (writeFileSync)', (done) => {
    const folderPath = '.';
    const instanceId = 'id';

    stubFs.writeFileSync.throws(new Error('Oh no writeFileSync!'));

    const opts = {
      service: 'rds',
      path: `/v13/downloadCompleteLogFile/${instanceId}/error/postgresql.log.2018-01-12-12`,
      region: 'us-east-1',
      headers: {
        Host: 'rds.us-east-1.amazonaws.com',
        'X-Amz-Date': '20180115T134531Z',
        Authorization: 'AWS4-HMAC-SHA256 Credential=GHIAI3QLC3MSYGBJ64IA/20180115/us-east-1/rds/aws4_request, SignedHeaders=host;x-amz-date, Signature=d649d8eef9903b4a6c8f08984a1ed1a7ceae14dd87de5f8b3802cc8f70967d5e',
      },
      hostname: 'rds.us-east-1.amazonaws.com',
    };

    stubAws4.sign.returns(opts);

    const expected = 'precogs';
    const response = new stream.PassThrough();
    response.write(JSON.stringify(expected));
    response.statusCode = 200;
    response.end();
    const request = new stream.PassThrough();

    stubHttpsRequest.yields(response).returns(request);

    rdsLogWithStubs.getLogs(folderPath, instanceId)
      .then(() => {
        chai.expect(stubHttpsRequest.firstCall.args[0]).to.deep.equal(opts);
        chai.expect(stubWinston.debug.callCount).to.equal(4);
        chai.expect(stubWinston.error.callCount).to.equal(1);
        chai.expect(stubWinston.info.callCount).to.equal(0);
        chai.expect(stubFs.writeFileSync.callCount).to.equal(1);
        chai.expect(stubFs.writeFileSync.firstCall.args[0]).to.match(/\w*postgresql\.log\.2018-01-12-12\.log\b/);
        chai.expect(stubFs.writeFileSync.firstCall.args[1]).to.equal('"precogs"');
        chai.expect(stubWinston.error.firstCall.args[0]).to.equal('Cannot retrieve file <error/postgresql.log.2018-01-12-12>.\nerror:Error: Oh no writeFileSync!\n');
        done();
      })
      .catch(done);
  });

  it('should success with specific logger', (done) => {
    const folderPath = '.';
    const instanceId = 'id';

    const opts = {
      service: 'rds',
      path: `/v13/downloadCompleteLogFile/${instanceId}/error/postgresql.log.2018-01-12-12`,
      region: 'us-east-1',
      headers: {
        Host: 'rds.us-east-1.amazonaws.com',
        'X-Amz-Date': '20180115T134531Z',
        Authorization: 'AWS4-HMAC-SHA256 Credential=GHIAI3QLC3MSYGBJ64IA/20180115/us-east-1/rds/aws4_request, SignedHeaders=host;x-amz-date, Signature=d649d8eef9903b4a6c8f08984a1ed1a7ceae14dd87de5f8b3802cc8f70967d5e',
      },
      hostname: 'rds.us-east-1.amazonaws.com',
    };

    stubAws4.sign.returns(opts);

    const expected = 'precogs';
    const response = new stream.PassThrough();
    response.write(JSON.stringify(expected));
    response.statusCode = 200;
    response.end();
    const request = new stream.PassThrough();

    stubHttpsRequest.yields(response).returns(request);

    rdsLogWithStubs.getLogs(folderPath, instanceId, stubWinston)
      .then((res) => {
        chai.expect(stubHttpsRequest.firstCall.args[0]).to.deep.equal(opts);
        chai.expect(stubWinston.debug.callCount).to.equal(4);
        chai.expect(stubWinston.error.callCount).to.equal(0);
        chai.expect(stubWinston.info.callCount).to.equal(1);
        chai.expect(res[0]).to.match(/\w*postgresql\.log\.2018-01-12-12\.log\b/);
        done();
      })
      .catch(done);
  });

  it('should success', (done) => {
    const folderPath = '.';
    const instanceId = 'id';

    const opts = {
      service: 'rds',
      path: `/v13/downloadCompleteLogFile/${instanceId}/error/postgresql.log.2018-01-12-12`,
      region: 'us-east-1',
      headers: {
        Host: 'rds.us-east-1.amazonaws.com',
        'X-Amz-Date': '20180115T134531Z',
        Authorization: 'AWS4-HMAC-SHA256 Credential=GHIAI3QLC3MSYGBJ64IA/20180115/us-east-1/rds/aws4_request, SignedHeaders=host;x-amz-date, Signature=d649d8eef9903b4a6c8f08984a1ed1a7ceae14dd87de5f8b3802cc8f70967d5e',
      },
      hostname: 'rds.us-east-1.amazonaws.com',
    };

    stubAws4.sign.returns(opts);

    const expected = 'precogs';
    const response = new stream.PassThrough();
    response.write(JSON.stringify(expected));
    response.statusCode = 200;
    response.end();
    const request = new stream.PassThrough();

    stubHttpsRequest.yields(response).returns(request);

    rdsLogWithStubs.getLogs(folderPath, instanceId)
      .then((res) => {
        chai.expect(stubHttpsRequest.firstCall.args[0]).to.deep.equal(opts);
        chai.expect(stubWinston.debug.callCount).to.equal(4);
        chai.expect(stubWinston.error.callCount).to.equal(0);
        chai.expect(stubWinston.info.callCount).to.equal(1);
        chai.expect(res[0]).to.match(/\w*postgresql\.log\.2018-01-12-12\.log\b/);
        done();
      })
      .catch(done);
  });
});
