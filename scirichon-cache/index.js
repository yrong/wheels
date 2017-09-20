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
        if(val&&(val.category !== 'User'&&val.category !== 'Role')){
            await del(val.uuid)
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
    let promises = []
    _.forIn(cmdb_type_routes,(val)=>{
        promises.push(apiInvoker('GET',cmdb_url,val.route,{'origional':true}))
    })
    let results = await Promise.all(promises)
    for (let result of results){
        if(result.data){
            for(let item of result.data){
                if(item&&item.uuid){
                    if(item.category === 'User')
                        await set(item.userid,{name:item.alias,uuid:item.userid,category:item.category})
                    else if(item.category === 'Cabinet')
                        await set(item.uuid,{name:item.name,uuid:item.uuid,category:item.category,parent:item.server_room_id})
                    else if(item.category === 'Shelf')
                        await set(item.uuid,{name:item.name,uuid:item.uuid,category:item.category,parent:item.warehouse_id})
                    else if(item.category === 'Software')
                        await set(item.uuid,{name:item.name,uuid:item.uuid,category:item.category,subtype:item.subtype})
                    else
                        await set(item.uuid,{name:item.name,uuid:item.uuid,category:item.category})
                }
            }
        }
    }
}

const getByCategory = async (category)=>{
    let keys = await cache.keys(),results = []
    for(let key of keys){
        let val = await cache.get(key)
        if(val.category === category){
            results.push(val)
        }
    }
    return results
}

const getItemByCategoryAndName = async (category,name)=>{
    let items = await getByCategory(category)
    return _.find(items,function(item){
        return item.name === name;
    })
}

const getItemByCategoryAndID = async (category,uuid)=>{
    let items = await getByCategory(category)
    return _.find(items,function(item){
        return item.uuid === uuid;
    })
};


module.exports = {loadAll,get,set,del,flushAll,getByCategory,getItemByCategoryAndName,getItemByCategoryAndID,cmdb_type_routes}