const _ = require('lodash')
const config = require('config')
const loadtest = require('loadtest')
const common = require('scirichon-common')
const schema = require('scirichon-json-schema')

const wrapRequest = (category,item) => {
    return {data:{category:category,fields:item}}
}

const batchAddItems = async(category,items)=>{
    let schema_obj = schema.getAncestorSchema(category),method='POST',result,base_url
    if(!schema_obj||!schema_obj.route||!schema_obj.service)
        throw new Error(`${category} api route not found`)
    base_url= common.getServiceApiUrl(schema_obj.service)
    base_url = base_url + '/api' + schema_obj.route + '/batch'
    result = await common.apiInvoker(method,base_url,'','',wrapRequest(category,items))
    return result.data||result
}

const loadItemsByBatchSize = async (category,params)=>{
    const num = parseInt(process.env[`${category}Num`])||10,batchSize=parseInt(process.env['BatchSize'])||100
    let round = parseInt(num/batchSize),remainder=num%batchSize,start,end,item,body,items=[],result,ids=[]
    for(let i=0;i<round;i++){
        items = [],start = i*batchSize,end = (i+1)*batchSize
        for(let j=start;j<end;j++){
            params.index = j
            item = await loader.generateItem(category,params)
            items.push(item)
        }
        result = await batchAddItems(category,items)
        ids = ids.concat(result)
        console.log(`load ${category} from ${start} to ${end}`)
    }
    if(remainder){
        start = round>0?end:0
        items = []
        for(let j=start;j<start+remainder;j++){
            params.index = j
            item = await loader.generateItem(category,params)
            items.push(item)
        }
        result = await batchAddItems(category,items)
        ids = ids.concat(result)
    }
    console.log(`load all ${category} success!`)
    return ids
}


function statusCallback(error, result, latency) {
    console.log('Current latency %j, result %j, error %j', latency, result, error);
    console.log('----');
    if(result){
        console.log('Request elapsed milliseconds: ', result.requestElapsed);
        console.log('Request index: ', result.requestIndex);
        console.log('Request loadtest() instance index: ', result.instanceIndex);
    }
}

let loader = {}

module.exports = {
    initialize:async()=>{
        const redisOption = {host:`${process.env['REDIS_HOST']||config.get('redis.host')}`,port:config.get('redis.port')};
        await schema.loadSchemas({redisOption,prefix:process.env['SCHEMA_TYPE']})
    },
    setLoader:(customized_loader)=>{
        loader = customized_loader
    },
    reload:async ()=>{
        await loader.reload()
    },
    run: async()=>{
        let result = await common.apiInvoker('POST',common.getServiceApiUrl('auth'),'/auth/login','',{
            "username":"demo",
            "password":"demo"
        }),options=options_customized=params={}
        result = result.data||result
        options = {
            concurrency:parseInt(process.env['Concurrency'])||1,
            requestsPerSecond:parseInt(process.env['RequestsPerSecond'])||10,
            agentKeepAlive:true,
            headers: {
                "Content-Type":"application/json;charset=utf-8",
                "token": result.token || common.InternalTokenId
            },
            statusCallback:statusCallback
        }
        options_customized = await loader.getRunnerOption(process.env['Scenario']);
        options = _.assign(options,options_customized)
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
    },
    loadItemsByBatchSize,
    batchAddItems
}