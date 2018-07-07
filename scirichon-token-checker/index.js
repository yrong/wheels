'use strict';

const config = require('config')
const _ = require('lodash')
const rp = require('request-promise')
const common = require('scirichon-common')
const ScirichonError = common.ScirichonError

module.exports = function checkToken(options) {
    if(!options.check_token_url){
        throw new Error('missing auth_url')
    }
    return async function (ctx, next) {
        if (common.needCheck(ctx))
        {
            let token,result,passport,Token=common.TokenName,User=common.TokenUserName
            token = (ctx.request.body && ctx.request.body[Token])
                || ctx.query[Token]
                || ctx.req.headers[Token]
                || ctx.cookies.get(Token)
            if(!token){
                throw new ScirichonError('no token found in request')
            }
            result = await common.apiInvoker('POST',options.check_token_url,'','',{token})
            passport = result.data||result
            if(passport&&passport.local){
                ctx[Token] = token
                ctx[User] = passport.local
            }else{
                throw new ScirichonError('no user for the token found')
            }
            await next()
        }
        else {
            await next()
        }
    }
}
