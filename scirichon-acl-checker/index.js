const acl = require('./acl')

const isOwn = (userInObj,userInToken)=>{
    let userId = userInToken.uuid,userAlias = userInToken.alias
    if(userInObj===userId||userInObj===userId.toString()||userInToken===userAlias)
        return true
    return false
}

const middleware = async (ctx, next) => {
    let promise,hasRight,userInObj,own
    if(ctx.local&&ctx.local.roles&&ctx.local.roles.length){
        if(ctx.method === 'PUT'||ctx.method === 'PATCH'||ctx.method === 'DELETE'){
            promise = new Promise((resolve, reject) => {
                acl.isAllowed(ctx.local.uuid, '*', 'UPDATE', function(err, res){
                    if(err){
                        reject(err)
                    }else{
                        if(!res){
                            acl.isAllowed(ctx.local.uuid, 'own', 'UPDATE', function(err, res){
                                if(res) {
                                    if(ctx.path.includes('/api/cfgItems')){
                                        userInObj = ctx.request.body.data.fields.responsibility
                                        own = isOwn(userInObj,ctx.local)
                                        resolve(own)
                                    }else if(ctx.path.includes('/articles')){
                                        userInObj = ctx.request.body.author
                                        own = isOwn(userInObj,ctx.local)
                                        resolve(own)
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
    }else{
        if(ctx.method === 'PUT'||ctx.method === 'PATCH'||ctx.method === 'DELETE'||(ctx.method === 'POST'&&!ctx.path.includes('/search'))){
            promise = Promise.resolve(false)
        }
    }
    hasRight = await Promise.resolve(promise)
    if(hasRight===false){
        ctx.throw(`user ${ctx.local.alias} with role ${ctx.local.roles} check right failed`,401)
    }else{
        await next()
    }
}
module.exports = {acl,middleware}