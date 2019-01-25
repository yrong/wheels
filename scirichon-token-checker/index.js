const _ = require('lodash')
const common = require('scirichon-common')
const ScirichonError = common.ScirichonError

module.exports = function checkToken(options) {
    if(!options.check_token_url){
        throw new Error('missing auth_url')
    }
    return async function (ctx, next) {
        if (common.needCheck(ctx))
        {
            let token,result,passport,Token=common.TokenName,User=common.TokenUserName,error_msg
            token = (ctx.request.body && ctx.request.body[Token])
                || ctx.query[Token]
                || ctx.req.headers[Token]
            if(!token){
                throw new ScirichonError('no token found in request',401)
            }
            try {
                result = await common.apiInvoker('POST', options.check_token_url, '', '', {token},{token})
            }catch(error){
                if(error&&error.error&&error.error.message&&error.error.message.content){
                    error_msg = error.error.message.content
                }else{
                    error_msg = error.message
                }
                throw new ScirichonError(`check token from auth failed,${error_msg}`,401)
            }
            passport = result.data||result
            if(_.isEmpty(passport)){
                throw new ScirichonError('no passport found in auth response',401)
            }else{
                ctx[Token] = token
                ctx[User] = passport.local||passport.ldap
            }
            await next()
        }
        else {
            await next()
        }
    }
}
