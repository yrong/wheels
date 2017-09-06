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

const internal_token_id = 'internal_api_invoke'

const apiInvoker = function(method,url,path,params,body){
    var options = {
        method: method,
        uri: url + path + (params?('?' + queryString.stringify(params)):''),
        body:body,
        json: true,
        headers: {
            'token': internal_token_id
        }
    }
    return rp(options)
}

class ScirichonError extends Error {
    constructor(message,status=500) {
        super(message)
        this.type = 'ScirichonError'
        this.status = status
    }
}

module.exports = {buildQueryCondition,apiInvoker,pruneEmpty,internal_token_id,ScirichonError}