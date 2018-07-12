const common = require('scirichon-common')
const ScirichonError = common.ScirichonError
const Redis = require('redis')
const Acl = require('acl-fork')
const _ = require('lodash')

const needCheck = (ctx)=>{
    if(ctx.headers[common.TokenName]===common.InternalTokenId){
        return false
    }
    if(ctx.path.includes('/no_auth')||(ctx.path.includes('/hidden'))||!ctx.path.match(/api/i)){
        return false
    }
    return true
}

const isSearchRequest = (ctx)=>{
    if(ctx.method==='GET'){
        return true
    }
    else if(ctx.path.match(/api\/?.*\/search/)||ctx.path.match(/api\/members/)){
        return true
    }
    return false
}

const isOwn = (ctx)=>{
    return true
}

module.exports = (option)=>{
    const redisClient = Redis.createClient(_.assign({db:2},option.redisOption));
    const acl = new Acl(new Acl.redisBackend(redisClient, 'acl'))
    return async (ctx, next) => {
        if(needCheck(ctx)){
            let hasRight,own,user = ctx[common.TokenUserName],name = user&&user.name,roles = user&&user.roles,exception_msg,promise
            if(!roles.length){
                throw new ScirichonError(`user ${name} without role not allowed`,401)
            }
            promise = new Promise((resolve,reject)=>{
                if(isSearchRequest(ctx)){
                    resolve(true)
                }else{
                    exception_msg = `user ${name} with roles ${roles} can not create/update/delete resource`
                    acl.isAllowed(user.uuid, '*', 'UPDATE', async function(err, res){
                        if(!res){
                            acl.isAllowed(user.uuid, 'own', 'UPDATE', async function (err, res) {
                                if (res) {
                                    own = isOwn(ctx)
                                    if (!own) {
                                        reject(new ScirichonError(exception_msg,401))
                                    }
                                    resolve(true)
                                }else {
                                    reject(new ScirichonError(exception_msg,401))
                                }
                            })
                        }else{
                            resolve(true)
                        }
                    })
                }
            })
            hasRight = await Promise.resolve(promise)
            if(hasRight===true){
                await next()
            }else{
                ctx.throw(`user ${name} with role ${roles} check right failed`,401)
            }
        }else{
            await next()
        }
    }
}