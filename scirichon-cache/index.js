const _ = require('lodash')
const rp = require('request-promise')
const queryString = require('querystring')
const config = require('config')
const redis_config = config.get('redis')
const RedisCache = require("node-cache-redis-fork");

const cache = new RedisCache({
    redisOptions: {host: redis_config.host, port: redis_config.port, db: 3},
    poolOptions: {priorityRange: 1}
})

const cmdb_type_routes = {
    User: {route: '/users'},
    ITService: {route: '/it_services/service'},
    ITServiceGroup: {route: '/it_services/group'},
    ServerRoom: {route: '/serverRooms'},
    WareHouse: {route: '/wareHouses'},
    Shelf: {route: '/shelves'},
    Cabinet: {route: '/cabinets'},
    ConfigurationItem: {route: '/cfgItems'},
    ProcessFlow: {route: '/processFlows'}
}

const prefix = 'scirichon-cache:'

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

const internal_token_id = 'internal_api_invoke'

const apiInvoker = function(method,url,path,params,body){
    var options = {
        method: method,
        uri: url + path + (params?('?' + queryString.stringify(params)):''),
        body:body,
        json: true,
        headers: {
            'token': internal_token_id
        }
    }
    return rp(options)
}

const loadAll = async (cmdb_url)=>{
    await flushAll()
    let results = [],key_id,key_name
    for(let val of _.values(cmdb_type_routes)){
        results.push(await apiInvoker('GET',cmdb_url,val.route,{'origional':true}))
    }
    for (let result of results){
        if(result.data){
            for(let item of result.data){
                if(item&&item.uuid){
                    if(item.category === 'User'){
                        key_id = item.userid,key_name = item.category + '_' + item.alias
                        await set(key_id,{name:item.alias,uuid:item.userid,category:item.category})
                        await set(key_name,{name:item.alias,uuid:item.userid,category:item.category})
                    }
                    else {
                        key_id = item.uuid,
                            await set(key_id,{name:item.name,uuid:item.uuid,category:item.category,subtype:item.subtype})
                        if(item.name){
                            key_name = item.category + '_' + item.name
                            await set(key_name,{name:item.name,uuid:item.uuid,category:item.category,subtype:item.subtype})
                        }
                    }
                }
            }
        }
    }
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
    return await get(category+"_"+name)
}

const getItemByCategoryAndID = async (category,uuid)=>{
    return await get(uuid)
};


module.exports = {loadAll,get,set,del,flushAll,getByCategory,getItemByCategoryAndName,getItemByCategoryAndID,cmdb_type_routes}