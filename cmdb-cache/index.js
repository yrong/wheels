const NodeCache = require( "node-cache" )
const cache = new NodeCache()
const _ = require('lodash')
const rp = require('request-promise')
const querystring = require('querystring');

const apiGetter = async function(url,path,params){
    let options = {
        method: 'GET',
        uri: url + path + (params?('/?' + querystring.stringify(params)):''),
        json: true
    }
    return await rp(options)
}

const routes = {
    Cabinet: {route: '/cabinets'},
    Position: {route: '/positions'},
    User: {route: '/users'},
    ITService: {route: '/it_services/service'},
    ITServiceGroup: {route: '/it_services/group'},
    ServerRoom: {route: '/serverRooms'},
    WareHouse: {route: '/wareHouses'},
    Shelf: {route: '/shelves'}
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

const loadAll = async (cmdb_url)=>{
    let promises = []
    _.forIn(routes,(val)=>{
        promises.push(apiGetter(cmdb_url,val.route))
    })
    let items = await Promise.all(promises)
    _.each(items,(item)=>{
        _.each(item.data,(item)=>{
            if(item&&item.uuid){
                if(item.category === 'User')
                    cache.set(item.userid,{name:item.alias,uuid:item.userid,category:item.category})
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


module.exports = {loadAll,get,set,del,flushAll,getByCategory,getItemByCategoryAndName,getItemByCategoryAndID}