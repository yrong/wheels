const _ = require('lodash')
const rp = require('request-promise')
const queryString = require('querystring')
const config = require('config')
const redis_config = config.get('redis')
const RedisCache = require("node-cache-redis-fork")
const common = require('scirichon-common')
const schema = require('redis-json-schema')
const uuid_validator = require('uuid-validate')

const cache = new RedisCache({
    redisOptions: {host: redis_config.host, port: redis_config.port, db: 3},
    poolOptions: {priorityRange: 1}
})

const prefix = 'scirichon-cache:'

let load_url = {}

const setLoadUrl = (url)=>{
    load_url = url
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

const saveItem = async (item)=>{
    if(item&&item.uuid&&item.category){
        if(item.category === 'User'){
            await set(item.userid,{name:item.alias,uuid:item.userid,category:item.category,roles:item.roles})
            await set(item.category + '_' + item.alias,{name:item.alias,uuid:item.userid,category:item.category,roles:item.roles})
        }
        else {
            await set(item.uuid,{name:item.name,uuid:item.uuid,category:item.category,subtype:item.subtype})
            if(item.name){
                await set(item.category + '_' + item.name,{name:item.name,uuid:item.uuid,category:item.category,subtype:item.subtype})
            }
        }
    }
}

const loadAll = async ()=>{
    let results = [],key_id,key_name,cmdb_type_routes = await schema.getApiRoutesAll()
    if(load_url&&load_url.cmdb_url&&!_.isEmpty(cmdb_type_routes)){
        await flushAll()
        for(let val of _.values(cmdb_type_routes)){
            results.push(await common.apiInvoker('GET',load_url.cmdb_url,val.route,{'origional':true}))
        }
        for (let result of results){
            result = result.data||result
            if(result&&result.length){
                for(let item of result){
                    await saveItem(item)
                }
            }
        }
    }
}

const loadOne = async (category,uuid)=>{
    let item,route,body,name,cmdb_type_routes = await schema.getApiRoutesAll()
    if(load_url&&load_url.cmdb_url&&cmdb_type_routes[category]&&cmdb_type_routes[category].route) {
        console.log(`load ${uuid} from cmdb`)
        if(uuid_validator(uuid)||_.isInteger(uuid)){
            body = {category,uuid,cypher:`MATCH (n:${category}) WHERE n.uuid={uuid} RETURN n`}
        }else if(_.isString(uuid)){
            name = uuid,body = {category,name,cypher:`MATCH (n:${category}) WHERE n.name={name} RETURN n`}
        }
        item = await common.apiInvoker('POST',load_url.cmdb_url,'/searchByCypher',{'origional':true},body)
        item = item.data||item
        await saveItem(item)
    }
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

const getItemByCategoryAndName = async (category,name)=>{
    let result = await get(category+"_"+name)
    if(!result){
        result = await loadOne(category,name)
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


module.exports = {loadAll,get,set,del,flushAll,getByCategory,getItemByCategoryAndName,getItemByCategoryAndID,setLoadUrl}