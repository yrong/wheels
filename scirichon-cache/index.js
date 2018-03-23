const _ = require('lodash')
const rp = require('request-promise')
const queryString = require('querystring')
const RedisCache = require("node-cache-redis-fork")
const common = require('scirichon-common')
const scirichon_schema = require('redis-json-schema')
const uuid_validator = require('uuid-validate')
const delimiter = common.Delimiter
const config = require('config')

let cache,prefix,cache_loadUrl={}

const initialize = async (option)=>{
    if(!option.redisOption||!option.prefix){
        throw new Error('required field missing when initialize cache')
    }
    cache = new RedisCache({
        redisOptions: _.assign({db:3},option.redisOption),
        poolOptions: {priorityRange: 1}
    })
    prefix = `${option.prefix}:`
    await scirichon_schema.loadSchemas(option)
    let schemas = scirichon_schema.getSchemas(),service_url
    if(_.isEmpty(schemas)){
        throw new Error('load schema failed')
    }
    _.each(schemas,(schema,category)=>{
        if(schema.route){
            port = config.get(`${process.env['NODE_NAME']}.port`)
            cache_loadUrl[category] = `http://localhost:${port}/api${schema.route}`
        }else if(schema.service&&schema.loadUrl){
            service_url = common.getServiceApiUrl(schema.service)
            cache_loadUrl[category] = `${service_url}${schema.loadUrl}`
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
    let keys = await cache.keys(prefix+'*')
    for(let key of keys){
        val = await cache.get(key)
        await cache.del(key)
    }
}

const addItem = async (item)=>{
    let schema_obj = scirichon_schema.getAncestorSchema(item.category)
    if(schema_obj.cache&&schema_obj.cache.ignore)
        return
    if(schema_obj.cache&&schema_obj.cache.fields)
        item = _.pick(item,schema_obj.cache.fields)
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
    let results = [],result,load_url
    await flushAll()
    for(let category in cache_loadUrl){
        load_url = cache_loadUrl[category]
        result = await common.apiInvoker('GET',load_url,'',{'origional':true})
        result = result.data||result
        if(result.length){
            results = results.concat(result)
        }
    }
    for (let item of results){
        await addItem(item)
    }
}

const loadOne = async (category,uuid)=>{
    let item,load_url
    if(uuid_validator(uuid)||(common.isLegacyUserId(category,uuid))||category==='Role'){
        load_url = cache_loadUrl[category]
        try{
            item = await common.apiInvoker('GET',load_url,`/${uuid}`,{'origional':true})
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
    return result
}

const getItemByCategoryAndID = async (category,uuid)=>{
    let result = await get(uuid)
    if(!result){
        result = await loadOne(category,uuid)
    }
    return result
};


module.exports = {loadAll,get,set,del,flushAll,getItemByCategoryAndUniqueName,getItemByCategoryAndID,initialize,addItem,delItem}