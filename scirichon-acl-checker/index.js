const common = require('scirichon-common')
const ScirichonError = common.ScirichonError
const Redis = require('redis')
const Acl = require('acl-fork')
const _ = require('lodash')

const isOwn = (ctx)=>{
    return true
}

const needCheck = (ctx)=>{
    if(ctx.headers[common.TokenName]==common.InternalTokenId){
        return false
    }
    else if (ctx.method === 'GET'){
        return false
    }
    else if(ctx.method ==='POST' && (ctx.path.includes('/search')||ctx.path.includes('/members'))){
        return false
    }
    else if(ctx.method ==='DELETE' && (ctx.path.includes('/hidden'))){
        return false
    }
    else if(ctx.path.includes('/no_auth/api')){
        return false
    }
    return true
}

module.exports = (option)=>{
    const redisClient = Redis.createClient(_.assign({db:2},option.redisOption));
    const acl = new Acl(new Acl.redisBackend(redisClient, 'acl'))
    return async (ctx, next) => {
        if(needCheck(ctx)){
            let hasRight,own,user = ctx[common.TokenUserName],name = user&&user.name,roles = user&&user.roles,own_exception_msg,promise
            if(!roles.length){
                throw new ScirichonError(`user ${name} without role not allowed`)
            }
            promise = new Promise((resolve,reject)=>{
                acl.isAllowed(user.uuid, '*', 'UPDATE', async function(err, res){
                    if(!res){
                        own_exception_msg = `user ${name} with roles ${roles} can not create/update/delete resource not owned by yourself`
                        acl.isAllowed(user.uuid, 'own', 'UPDATE', async function (err, res) {
                            if (res) {
                                own = isOwn(ctx)
                                if (!own) {
                                    reject(new ScirichonError(own_exception_msg))
                                }
                                resolve(true)
                            }else {
                                reject(new ScirichonError(own_exception_msg))
                            }
                        })
                    }else{
                        resolve(true)
                    }
                })
            })
            hasRight = await Promise.resolve(promise)
            if(hasRight===false){
                ctx.throw(`user ${name} with role ${roles} check right failed`,401)
            }else{
                await next()
            }
        }else{
            await next()
        }
    }
}