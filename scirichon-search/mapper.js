const _ = require('lodash')
const scirichonSchema = require('scirichon-json-schema')
const scirichonCache = require('scirichon-cache')
const scirichonResponseMapper = require('scirichon-response-mapper')

const getIndexByCategory = (category)=>{
    let schema_obj = scirichonSchema.getAncestorSchema(category),index
    if(schema_obj&&schema_obj.search&&schema_obj.search.index){
        index = schema_obj.search.index
    }
    return index
}

const findRefCategory = (category,key)=>{
    let refs = scirichonSchema.getSchemaRefProperties(category)
    for(let ref of refs){
        if(ref.attr===key){
            return ref.schema
        }
    }
}

const aggsMetaFields = ['key','key_as_string','buckets','doc_count','doc_count_error_upper_bound','sum_other_doc_count','ref_obj']

const aggsReferencedMapper =  async (val,category) => {
    let keys = _.keys(val)
    for(let key of keys){
        if(!_.includes(aggsMetaFields,key)){
            if(_.isArray(val[key]['buckets'])){
                for(let internal_val of val[key]['buckets']){
                    let ref_category = findRefCategory(category,key),cached_obj
                    if(ref_category){
                        cached_obj = await scirichonCache.getItemByCategoryAndID(ref_category,internal_val.key)
                        if(!_.isEmpty(cached_obj)){
                            internal_val.ref_obj = cached_obj
                        }
                    }
                    await aggsReferencedMapper(internal_val,category)
                }
            }
        }
    }
    return val
}

const removeAndRenameInternalProperties =  (val) => {
    if(_.isArray(val)) {
        val = _.map(val, function (val) {
            return removeAndRenameInternalProperties(val)
        });
    }else if(_.isObject(val)){
        for (let prop in val) {
            if(_.includes(['doc_count_error_upper_bound','sum_other_doc_count'],prop)){
                delete val[prop]
            }
            if(typeof val[prop] === 'object')
                removeAndRenameInternalProperties(val[prop])
        }
    }
    return val
}

const esResponseMapper = async function(result,params,ctx){
    if(params.aggs){
        result = result.aggregations
        result = await aggsReferencedMapper(result,params.category)
        result = removeAndRenameInternalProperties(result)
    }else{
        result =  {count:result.hits.total,results:_.map(result.hits.hits,(result)=>result._source)}
        if(result.count>0&&_.isArray(result.results)){
            result.results = await scirichonResponseMapper.responseMapper(result.results, params)
        }
    }
    return result
}

module.exports = {esResponseMapper,getIndexByCategory}