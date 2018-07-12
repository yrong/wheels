const _ = require('lodash')
const common = require('scirichon-common')
const logger = require('log4js-wrapper-advanced').getLogger()
const schema = require('scirichon-json-schema')
const search = require('scirichon-search')
const scirichon_cache = require('scirichon-cache')
const requestHandler = require('./requestHandler')
const cypherInvoker = require('../cypher/cypherInvoker')
const requestPostHandler = require('./requestPostHandler')
const hooks = require('./index')
const InternalUsedFields = common.InternalUsedFields

const batchUpdate  = async(ctx,category,uuids,change_obj,removed)=>{
    let cypher = `unwind {uuids} as uuid match (n:${category}) where n.uuid=uuid set `,script=``,old_obj, new_obj,objs=[]
    for(let key in change_obj){
        cypher += `n.${key}={${key}},`
        script += `ctx._source.${key}=params.${key};`
    }
    cypher = cypher.substr(0,cypher.length-1)
    if(removed){
        cypher += ` remove `
        for(let key of removed){
            cypher += `n.${key},`
            script += `ctx._source.remove("${key}");`
        }
        cypher = cypher.substr(0,cypher.length-1)
    }
    await cypherInvoker.executeCypher(ctx, cypher, _.assign({uuids},change_obj))
    let index = requestHandler.getIndexByCategory(category)
    if(index) {
        await search.batchUpdate(index, uuids, {script: {inline: script, params: change_obj}})
    }
    for (let uuid of uuids) {
        old_obj = await scirichon_cache.getItemByCategoryAndID(category, uuid)
        if (!_.isEmpty(old_obj)) {
            new_obj = _.assign({}, old_obj, change_obj)
            if (removed) {
                new_obj = _.omit(new_obj, removed)
            }
            await scirichon_cache.addItem(new_obj)
        }
        objs.push({uuid,old_obj,new_obj})
    }
    let needNotify = requestPostHandler.needNotify({category},ctx)
    if(needNotify) {
        let notifications = [], notification_url = common.getServiceApiUrl('notifier')
        for (let obj of objs) {
            notification = {user: ctx[common.TokenUserName], source: process.env['NODE_NAME'], action: 'UPDATE'}
            notification.type = category
            notification.update = change_obj
            notification.new = obj.new_obj
            notification.old = obj.old_obj
            notifications.push(notification)
        }
        await common.apiInvoker('POST', notification_url, '/api/notifications/batch', '', notifications)
    }
}

const batchAdd  = async(ctx,category,entries)=>{
    for(let item of entries){
        let handlers = hooks.getHandlers(),customizedHandler = handlers&&handlers[category]
        if(customizedHandler){
            if(item.procedure&&item.procedure.ignoreCustomizedHandler) {
            }else{
                await customizedHandler.postProcess(item, ctx)
            }
        }
    }
    let items = _.map(entries,(entry)=>entry.fields)
    let cypher = `unwind {items} as item merge (n:${category} {uuid:item.uuid}) on create set n=item on match set n=item`
    await cypherInvoker.executeCypher(ctx, cypher, {items: items})
    let index = requestHandler.getIndexByCategory(category)
    if(index){
        await search.batchCreate(index,entries)
    }
    for(let item of entries){
        await scirichon_cache.addItem(_.omit(item,InternalUsedFields))
    }
    let needNotify = requestPostHandler.needNotify({category},ctx)
    if(needNotify){
        let notifications = [],notification_url = common.getServiceApiUrl('notifier')
        for(let item of entries){
            notification = {user:ctx[common.TokenUserName],source:process.env['NODE_NAME'],action:'CREATE'}
            notification.type = item.category
            notification.new = _.omit(item,InternalUsedFields)
            notifications.push(notification)
        }
        await common.apiInvoker('POST',notification_url,'/api/notifications/batch','',notifications)
    }
}

const batchAddProcessor = async (params,ctx)=>{
    let entries = params.data.fields,category = params.data.category,item,items=[],result
    for(let entry of entries){
        schema.checkObject(category,entry)
        requestHandler.fieldsChecker(entry)
        item={category,data:{category}}
        item.data.fields = entry
        item.procedure = params.procedure
        item = await hooks.cudItem_preProcess(item,ctx)
        items.push(item)
    }
    await batchAdd(ctx,category,items)
    return _.map(items,(item)=>{return item.uuid})
}

module.exports = {batchAdd,batchUpdate,batchAddProcessor}
