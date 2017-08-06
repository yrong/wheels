const NodeCache = require( "node-cache" )
const cache = new NodeCache()
const _ = require('lodash')
const rp = require('request-promise')
const queryString = require('querystring')

const cmdb_auxiliary_type_routes = {
    User: {route: '/users'},
    ITService: {route: '/it_services/service'},
    ITServiceGroup: {route: '/it_services/group'},
    ServerRoom: {route: '/serverRooms'},
    WareHouse: {route: '/wareHouses'},
    Shelf: {route: '/shelves'},
    Cabinet: {route: '/cabinets'},
    OperatingSystem:{route:'/operatingSystems'}
}

const set = (key,val)=>{
    return cache.set(key,val)
}

const get = (key)=>{
    return cache.get(key)
}

const del = (key)=>{
    return cache.del(key)
}

const flushAll = ()=>{
    for(let key of cache.keys()){
        val = cache.get(key)
        if(val.category !== 'User'){
            cache.del(val.uuid)
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
    let promises = []
    _.forIn(cmdb_auxiliary_type_routes,(val)=>{
        promises.push(apiInvoker('GET',cmdb_url,val.route))
    })
    let items = await Promise.all(promises)
    _.each(items,(item)=>{
        _.each(item.data,(item)=>{
            if(item&&item.uuid){
                if(item.category === 'User')
                    cache.set(item.userid,{name:item.alias,uuid:item.userid,category:item.category})
                else if(item.category === 'Cabinet')
                    cache.set(item.uuid,{name:item.name,uuid:item.uuid,category:item.category,parent:item.server_room_id})
                else if(item.category === 'Shelf')
                    cache.set(item.uuid,{name:item.name,uuid:item.uuid,category:item.category,parent:item.warehouse_id})
                else
                    cache.set(item.uuid,{name:item.name,uuid:item.uuid,category:item.category})
            }
        })
    })
}

const getByCategory = (category)=>{
    let results = []
    for(let key of cache.keys()){
        val = cache.get(key)
        if(val.category === category){
            results.push(val)
        }
    }
    return results
}

const getItemByCategoryAndName = (category,name)=>{
    let items = getByCategory(category)
    return _.find(items,function(item){
        return item.name === name;
    })
}

const getItemByCategoryAndID = function(category,uuid){
    let items = getByCategory(category)
    return _.find(items,function(item){
        return item.uuid === uuid;
    })
};


module.exports = {loadAll,get,set,del,flushAll,getByCategory,getItemByCategoryAndName,getItemByCategoryAndID,cmdb_auxiliary_type_routes}