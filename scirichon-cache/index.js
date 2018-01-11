const _ = require('lodash')
const rp = require('request-promise')
const queryString = require('querystring')
const RedisCache = require("node-cache-redis-fork")
const common = require('scirichon-common')
const schema = require('redis-json-schema')
const uuid_validator = require('uuid-validate')
const delimiter = '&&&'

let load_url,cache,prefix

const initialize = async (option)=>{
    load_url = option.loadUrl
    cache = new RedisCache({
        redisOptions: _.assign({db:3},option.redisOption),
        poolOptions: {priorityRange: 1}
    })
    prefix = `${option.prefix}:`||`scirichon-cache:`
    await schema.loadSchemas(option)
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
        if(val&&val.category&&(val.category !== 'User'&&val.category !== 'Role')){
            await cache.del(key)
        }
    }
}

const addItem = async (item)=>{
    let schema_obj = schema.getAncestorSchema(item.category)
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
    let schema_obj = schema.getAncestorSchema(item.category)
    if(schema_obj.cache&&schema_obj.cache.ignore)
        return
    if (item.uuid)
        await del(item.uuid)
    if (item.category&&item.unique_name)
        await del(item.category + delimiter + item.unique_name)
}

const loadAll = async ()=>{
    let results = [],key_id,key_name,route_schemas = schema.getApiRouteSchemas(),result
    if(!_.isEmpty(route_schemas)){
        await flushAll()
        for(let val of route_schemas){
            result = await common.apiInvoker('GET',load_url.cmdb_url||load_url.vehicle_url,val.route,{'origional':true})
            result = result.data||result
            results.push(result)
        }
        for (let result of results){
            if(result&&result.length){
                for(let item of result){
                    await addItem(item)
                }
            }
        }
    }
}

const loadOne = async (category,uuid)=>{
    let item,body
    if(uuid_validator(uuid)||(common.isLegacyUserId(category,uuid))){
        body = {category,uuid,cypher:`MATCH (n:${category}) WHERE n.uuid={uuid} RETURN n`}
    }else if(_.isString(uuid)){
        body = {category,unique_name:uuid,cypher:`MATCH (n:${category}) WHERE n.unique_name={unique_name} RETURN n`}
    }
    item = await common.apiInvoker('POST',load_url.cmdb_url||load_url.vehicle_url,'/searchByCypher',{'origional':true,'plain':true},body)
    item = item.data||item
    if(!_.isEmpty(item))
        item = await addItem(item)
    return item
}

const getByCategory = async (category)=>{
    let keys = await cache.keys(prefix+'*'),results = []
    for(let key of keys){
        let val = await cache.get(key)
        if(val.category === category){
            results.push(val)
        }
    }
    return results
}

const getItemByCategoryAndUniqueName = async (category,unique_name)=>{
    let result = await get(category+delimiter+unique_name)
    if(!result){
        result = await loadOne(category,unique_name)
    }
    return result
}

const getItemByCategoryAndID = async (category,uuid)=>{
    let result = await get(uuid)
    if(!result){
        result = await loadOne(category,uuid)
    }
    return result
};


module.exports = {loadAll,get,set,del,flushAll,getByCategory,getItemByCategoryAndUniqueName,getItemByCategoryAndID,initialize,addItem,delItem}