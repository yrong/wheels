const acl = require('./acl')
const middleware = async (ctx, next) => {
    if(ctx.local&&ctx.local.uuid&&ctx.local.roles){
        let promise,hasRight
        if(ctx.method === 'PUT'||ctx.method === 'PATCH'||ctx.method === 'DELETE'){
            promise = new Promise((resolve, reject) => {
                acl.isAllowed(ctx.local.uuid, '*', 'UPDATE', function(err, res){
                    if(err){
                        reject(err)
                    }else{
                        if(!res){
                            acl.isAllowed(ctx.local.uuid, 'own', 'UPDATE', function(err, res){
                                if(res) {
                                    if(ctx.path.includes('/api/cfgItems')&&ctx.request.body.data.fields.responsibility!==ctx.local.uuid){
                                        resolve(false)
                                    }else if(ctx.path.includes('/articles')&&ctx.request.body.author!==ctx.local.uuid){
                                        resolve(false)
                                    }
                                    else{
                                        resolve(true)
                                    }
                                }else{
                                    resolve(false)
                                }
                            })
                        }else{
                            resolve(true)
                        }
                    }
                })
            })
        }
        else if(ctx.method === 'POST'&&!ctx.path.includes('/search')){
            promise = new Promise((resolve, reject) => {
                acl.isAllowed(ctx.local.uuid, '*', 'CREATE', function(err, res){
                    if(err){
                        reject(err)
                    }else{
                        resolve(res)
                    }
                })
            })
        }
        hasRight = await Promise.resolve(promise)
        if(hasRight===false){
            ctx.throw(`user ${ctx.local.alias} with role ${ctx.local.roles} check right failed`,401)
        }else{
            await next()
        }
    }else{
        await next()
    }
}
module.exports = {acl,middleware}