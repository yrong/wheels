const config = require('config')
const common = require('scirichon-common')
const schema = require('scirichon-json-schema')
const scirichon_cache = require('scirichon-cache')
const search = require('scirichon-search')
const requestHandler = require('./requestHandler')
const hidden_fields = common.internalUsedFields

const needNotify = (params,ctx)=>{
    if(ctx.headers[common.TokenName] === common.InternalTokenId)
        return false
    if(params.procedure&&params.procedure.ignoreNotification)
        return false
    let schema_obj = schema.getAncestorSchema(params.category)
    if(schema_obj&&schema_obj.notification)
        return true
}

const addNotification = async (params,ctx)=>{
    if(needNotify(params,ctx)){
        let notification = {type:params.category,user:ctx[common.TokenUserName],source:process.env['NODE_NAME']}
        if(ctx.method === 'POST'){
            notification.action = 'CREATE'
            notification.new = requestHandler.stringFields2Object(params.fields)
        }
        else if(ctx.method === 'PUT' || ctx.method === 'PATCH'){
            notification.action = 'UPDATE'
            notification.new = requestHandler.stringFields2Object(params.fields)
            notification.old = requestHandler.stringFields2Object(params.fields_old)
            notification.update = params.change
        }else if(ctx.method === 'DELETE'){
            notification.action = 'DELETE'
            notification.old = requestHandler.stringFields2Object(params.fields_old)
        }
        let notification_subscriber = requestHandler.legacyFormat(params)?params.data.notification:params.notification_subscriber
        if(notification_subscriber){
            if(notification_subscriber.subscribe_user){
                notification.subscribe_user = notification_subscriber.subscribe_user
                if(notification_subscriber.subscribe_role){
                    notification.subscribe_role = notification_subscriber.subscribe_role
                }else{
                    notification.subscribe_role = []
                }
            }
            else{
                if(notification_subscriber.subscribe_role){
                    notification.subscribe_role = notification_subscriber.subscribe_role
                    notification.subscribe_user = []
                }
            }
            if(notification_subscriber.additional){
                notification.additional = notification_subscriber.additional
            }
        }
        await common.apiInvoker('POST',common.getServiceApiUrl('notifier'),'/api/notifications','',notification)
    }
}

const updateCache = async (params,ctx)=>{
    if (ctx.method === 'POST') {
        await scirichon_cache.addItem(requestHandler.stringFields2Object(params.fields))
    }
    else if(ctx.method === 'PUT' || ctx.method === 'PATCH'){
        await scirichon_cache.delItem(requestHandler.stringFields2Object(params.fields_old))
        await scirichon_cache.addItem(requestHandler.stringFields2Object(params.fields))
    }
    else if (ctx.method === 'DELETE') {
        await scirichon_cache.delItem(requestHandler.stringFields2Object(params.fields_old))
    }
}

const updateSearch = async (params,ctx)=>{
    if(ctx.method==='POST'){
        let schema_obj = schema.getAncestorSchema(params.category)
        if(schema_obj&&schema_obj.search){
            if(schema_obj.search.upsert){
                await search.addOrUpdateItem(params,false,true)
            }else{
                await search.addOrUpdateItem(params,false,false)
            }
        }
    }
    else if(ctx.method==='PUT'||ctx.method==='PATCH'){
        await search.addOrUpdateItem(params,true)
    }
    if(ctx.method==='DELETE'){
        await search.deleteItem(params)
    }
}

module.exports = {addNotification,updateCache,updateSearch,needNotify}

