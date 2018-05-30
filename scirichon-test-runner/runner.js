#!/usr/bin/env node

const _ = require('lodash')
const config = require('config')
const loadtest = require('loadtest')
const common = require('scirichon-common')
const schema = require('scirichon-json-schema')
const path = require('path')
const loader = require(path.resolve('./' + process.env['TestSet']))
const batch = require('./batch')

function statusCallback(error, result, latency) {
    console.log('Current latency %j, result %j, error %j', latency, result, error);
    console.log('----');
    if(result){
        console.log('Request elapsed milliseconds: ', result.requestElapsed);
        console.log('Request index: ', result.requestIndex);
        console.log('Request loadtest() instance index: ', result.instanceIndex);
    }
}

class Runner {
    constructor() {

    }

    async initialize() {
        const redisOption = {host:`${process.env['REDIS_HOST']||config.get('redis.host')}`,port:config.get('redis.port')};
        await schema.loadSchemas({redisOption,prefix:process.env['SCHEMA_TYPE']})
        batch.setLoader(loader)
    }

    async reload() {
        await loader.reload()
    }

    async run() {
        let result = await common.apiInvoker('POST',common.getServiceApiUrl('auth'),'/auth/login','',{
            "username":"demo",
            "password":"demo"
        }),options
        result = result.data||result
        options = {
            concurrency:parseInt(process.env['Concurrency'])||1,
            requestsPerSecond:parseInt(process.env['RequestsPerSecond'])||10,
            agentKeepAlive:true,
            contentType:"application/json",
            headers: {
                "Content-Type":"application/json;charset=utf-8",
                "token": result.token || common.InternalTokenId
            },
            statusCallback:statusCallback
        }
        options = _.assign(options,await loader.getRunnerOption(process.env['Scenario'])||{})
        return new Promise((resolve,reject)=>{
            loadtest.loadTest((options), function(error, result)
            {
                if (error)
                {
                    console.error('Got an error: %s', error);
                    reject(error)
                }
                console.log('All tests run successfully: %j',result);
                resolve(result)
            });
        })
    }
}

(async () => {
    try {
        let runner = new Runner()
        await runner.initialize()
        let command = process.env['Command']
        await runner[command]()
        console.log('test finished!')
        process.exit(0)
    } catch (e) {
        console.error('Got an error during test: %s', e.stack);
    }
})();
