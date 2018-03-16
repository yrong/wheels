const rp = require('request-promise')
const queryString = require('querystring')
const _ = require('lodash')

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

const InternalTokenId = 'internal_api_invoke'
const TokenName = 'token'
const TokenUserName = 'token_user'
const Delimiter = '&&&'

const apiInvoker = function(method,url,path,params,body){
    var options = {
        method: method,
        uri: url + path + (params?('?' + queryString.stringify(params)):''),
        body:body,
        json: true,
        headers: {
        }
    }
    options.headers[TokenName] = InternalTokenId
    return rp(options)
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
    let compound_model_key = '', split = '&&&'
    for (let key of fields) {
        compound_model_key = compound_model_key + value[key] + split
    }
    return compound_model_key.slice(0, (-split.length))
}


module.exports = {buildQueryCondition,apiInvoker,pruneEmpty,ScirichonError,ScirichonWarning,isLegacyUserId,buildCompoundKey,
    InternalTokenId,TokenName,TokenUserName,Delimiter}