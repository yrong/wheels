const _ = require('lodash')
const rp = require('request-promise')
const queryString = require('querystring')
const RedisCache = require("node-cache-redis-fork")
const common = require('scirichon-common')
const scirichon_schema = require('scirichon-json-schema')
const uuid_validator = require('uuid-validate')
const delimiter = common.Delimiter
const config = require('config')
const redis = require('redis')

let cache,client,prefix,cache_loadUrl={}

const initialize = async (option)=>{
    if(!option.redisOption||!option.prefix){
        throw new Error('required field missing when initialize cache')
    }
    let redisOption = _.assign({db:3},option.redisOption)
    cache = new RedisCache({
        redisOptions: redisOption,
        poolOptions: {priorityRange: option.priorityRange||1}
    })
    client = redis.createClient(redisOption);
    prefix = `${option.prefix}:`
    await scirichon_schema.loadSchemas(option)
    let schemas = scirichon_schema.getSchemas(),service_url
    if(_.isEmpty(schemas)){
        throw new Error('load schema failed')
    }
    _.each(schemas,(schema,category)=>{
        if(schema.route&&schema.service){
            cache_loadUrl[category] = `${common.getServiceApiUrl(schema.service)}${schema.route}`
        }
    })
}

const set = async (key,val)=>{
    return await cache.set(prefix+key,val)
}

const get = async (key)=>{
    return await cache.get(prefix+key)
}

const del = async (key)=>{
    return await cache.del(prefix+key)
}

const flushAll = async ()=>{
    return new Promise((resolve, reject) => {
        client.eval("return redis.call('del', 'default-template',unpack(redis.call('keys', ARGV[1])))", 0, prefix+'*', (err, res) => {
            if(err)
                reject(err)
            else
                resolve(res)
        })
    })
}

const addItem = async (item)=>{
    let schema_obj = scirichon_schema.getAncestorSchema(item.category)
    if(schema_obj.cache&&schema_obj.cache.ignore)
        return
    if(schema_obj.cache&&schema_obj.cache.fields)
        item = _.pick(item,schema_obj.cache.fields)
    if(schema_obj.cache&&schema_obj.cache.exclude_fields)
        item = _.omit(item,schema_obj.cache.exclude_fields)
    if(item.uuid)
        await set(item.uuid,item)
    if(item.category&&item.unique_name){
        await set(item.category + delimiter + item.unique_name,item)
    }
    return item
}

const delItem = async (item)=>{
    let schema_obj = scirichon_schema.getAncestorSchema(item.category)
    if(schema_obj.cache&&schema_obj.cache.ignore)
        return
    if (item.uuid)
        await del(item.uuid)
    if (item.category&&item.unique_name)
        await del(item.category + delimiter + item.unique_name)
}

const loadAll = async ()=>{
    let result,load_url
    await flushAll()
    for(let category in cache_loadUrl){
        load_url = cache_loadUrl[category]
        try{
            result = await common.apiInvoker('GET',load_url,'',{'original':true})
        }catch(err){
            console.log(`load err:${err.stack||err}`)
        }
        result = result.data||result
        if(result&&result.length){
            for (let item of result){
                await addItem(item)
            }
        }
    }

}

const loadOne = async (category,uuid)=>{
    let item,load_url
    if(uuid_validator(uuid)||(common.isLegacyUserId(category,uuid))||category==='Role'){
        load_url = cache_loadUrl[category]
        try{
            item = await common.apiInvoker('GET',load_url,`/${uuid}`,{'original':true})
        }catch(err){
            console.log(`load err:${err.stack||err}`)
        }
        if(item){
            item = item.data||item
            if(!_.isEmpty(item)){
                item.category = category
                item = await addItem(item)
            }
        }
    }
    return item
}


const getItemByCategoryAndUniqueName = async (category,unique_name)=>{
    let result = await get(category+delimiter+unique_name)
    if(_.isEmpty(result)){
        console.log(`cache hit missing with category ${category} and name ${unique_name}`)
    }
    return result
}

const getItemByCategoryAndID = async (category,uuid)=>{
    let result = await get(uuid)
    if(!result){
        result = await loadOne(category,uuid)
    }
    if(_.isEmpty(result)){
        console.log(`cache hit missing with category ${category} and uuid ${uuid}`)
    }
    return result
};


module.exports = {loadAll,get,set,del,flushAll,getItemByCategoryAndUniqueName,getItemByCategoryAndID,initialize,addItem,delItem}