const queryString = require('querystring')
const _ = require('lodash')
const config = require('config')
const axios = require('axios')

const pruneEmpty = function(obj) {
    return function prune(current) {
        _.forOwn(current, function (value, key) {
            if (_.isUndefined(value) || _.isNull(value) || _.isNaN(value) ||
                (_.isString(value) && _.isEmpty(value)) ||
                (_.isObject(value) && _.isEmpty(prune(value)))) {

                delete current[key];
            }
        });
        if (_.isArray(current)) _.pull(current, undefined);
        return current;

    }(_.cloneDeep(obj));
}

const buildQueryCondition = (querys) =>{
    let sortby = querys.sortby?querys.sortby:'createdAt';
    let order = querys.order?querys.order:'DESC';
    let page = querys.page?querys.page:1;
    let per_page = querys.per_page?querys.per_page:1000;
    let offset = (parseInt(page)-1)*parseInt(per_page);
    querys.filter = querys.filter?pruneEmpty(querys.filter):{}
    return {where:querys.filter,order:[[sortby,order]],offset:offset,limit:per_page,raw:true};
}

const getConfigWithDefaultValue = (configName,defaultVal)=>{
    let field
    try{
        field = config.get(configName)
    }catch(error){
        field = defaultVal
    }
    return field
}

const Delimiter = '&&&'

const apiInvoker = async function (method, url, path, params, body, headers) {
    let options = {
            method: method,
            url: url + path + (params ? ('?' + queryString.stringify(params)) : ''),
            data: body
        }, internal_token = {},
        tokenName = getConfigWithDefaultValue('auth.tokenFieldName', 'token'),
        internalToken = getConfigWithDefaultValue('auth.internalUsedToken', 'qwe!@#')
    internal_token[tokenName] = internalToken
    options.headers = headers || internal_token
    let response = await axios(options)
    return response && response.data
}

class ScirichonError extends Error {
    constructor(message,status=501) {
        super('ScirichonError:'+message)
        this.status = status
        this.customized_message = message
    }
}

class ScirichonWarning extends Error {
    constructor(message,status=502) {
        super('ScirichonWarning:'+message)
        this.status = status
        this.customized_message= message
    }
}

const isLegacyUserId = (category,uuid) =>{
    return category==='User'&& (/^\d+$/.test(uuid)||_.isInteger(uuid))
}

const buildCompoundKey = (fields,value) => {
    let compound_model_key = ''
    for (let key of fields) {
        compound_model_key = compound_model_key + value[key] + Delimiter
    }
    return compound_model_key.slice(0, (-Delimiter.length))
}

const getServiceApiUrl = (serviceName)=>{
    let service = config.get(serviceName),serviceIP=service.host||'localhost',servicePort=service.port
    return `http://${serviceIP}:${servicePort}`
}

const needCheck = (ctx)=>{
    const tokenHeader = getConfigWithDefaultValue('auth.tokenFieldName','token')
    const internalToken = getConfigWithDefaultValue('auth.internalUsedToken','qwe!@#')
    const ignoredUrlPattern = getConfigWithDefaultValue('auth.ignoredUrlPattern',"\\/no_auth|\\/hidden")
    const apiUrlPattern = getConfigWithDefaultValue('auth.apiUrlPattern',"\\/api")
    if(ctx.headers[tokenHeader]===internalToken){
        return false
    }
    const ignoredUrlExp = new RegExp(ignoredUrlPattern,"i")
    if(ctx.path.match(ignoredUrlExp)){
        return false
    }
    const apiUrlExp = new RegExp(apiUrlPattern,"i");
    if(ctx.path.match(apiUrlExp)){
        return true
    }
    return false
}

module.exports = {buildQueryCondition,apiInvoker,pruneEmpty,ScirichonError,ScirichonWarning,isLegacyUserId,buildCompoundKey,
    getConfigWithDefaultValue,Delimiter,getServiceApiUrl,needCheck}
