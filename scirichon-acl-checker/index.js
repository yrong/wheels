const acl = require('./acl')
const common = require('scirichon-common')
const ScirichonError = common.ScirichonError

const isOwn = (ctx,userInToken)=>{
    let userId = userInToken.uuid,userAlias = userInToken.alias,userInObj
    if(ctx.path.includes('/api/cfgItems')){
        userInObj = ctx.request.body.data.fields.responsibility
    }else if(ctx.path.includes('/articles')){
        userInObj = ctx.request.body.author
    }
    if(userInObj===userId||userInObj===userId.toString()||userInToken===userAlias)
        return true
    return false
}

const middleware = async (ctx, next) => {
    let hasRight,own,token_user = ctx[common.TokenUserName]||JSON.parse(ctx.cookies.get(common.TokenUserName)?ctx.cookies.get(common.TokenUserName):null)
    let promise = new Promise((resolve,reject)=>{
        if (ctx.path.includes('/auth/login') || ctx.path.includes('/auth/register')
            || ctx.path.includes('.html')||ctx.path.includes('.ico')||!ctx.path.match(/api/i)||ctx.headers[common.TokenName]==common.InternalTokenId)
        {
            resolve(true)
        }
        if(token_user&&token_user.roles&&token_user.roles.length) {
            if (ctx.method === 'PUT' || ctx.method === 'PATCH' || ctx.method === 'DELETE') {
                acl.isAllowed(token_user.uuid, '*', 'UPDATE', function(err, res){
                    if(!res){
                        if(ctx.path.includes('/api/cfgItems')||ctx.path.includes('/articles')){
                            acl.isAllowed(token_user.uuid, 'own', 'UPDATE', function(err, res){
                                if(res) {
                                    own = isOwn(ctx,token_user)
                                    if(!own){
                                        reject(new ScirichonError(`can not update/delete resource not owned by yourself with userid as ${token_user.uuid}`))
                                    }
                                    resolve(own)
                                }else{
                                    reject(new ScirichonError(`can not update/delete resource with role as ${token_user.roles}`))
                                }
                            })
                        }else{
                            resolve(true)
                        }
                    }else{
                        resolve(true)
                    }
                })
            }
            else if(ctx.method === 'POST'&&!ctx.path.includes('/search')){
                acl.isAllowed(token_user.uuid, '*', 'CREATE', function(err, res){
                    if(!res){
                        reject(new ScirichonError(`can not create resource with role as ${token_user.roles}`))
                    }
                    resolve(res)
                })
            }else{
                resolve(true)
            }
        }else{
            if(ctx.method === 'PUT'||ctx.method === 'PATCH'||ctx.method === 'DELETE'||(ctx.method === 'POST'&&!ctx.path.includes('/search'))){
                reject(new ScirichonError(`user with no role can not add/modify/delete`))
            }else{
                resolve(true)
            }
        }
    })
    hasRight = await Promise.resolve(promise)
    if(hasRight===false){
        ctx.throw(`user ${token_user.alias} with role ${token_user.roles} check right failed`,401)
    }else{
        await next()
    }
}
module.exports = {acl,middleware}