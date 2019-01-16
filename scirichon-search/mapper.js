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

const ignoredMetaFields = ['doc_count_error_upper_bound','sum_other_doc_count','key_as_string','value_as_string']
const aggsMetaFields = _.concat(['key','buckets','doc_count','ref_obj'],ignoredMetaFields)

const removeBucketAndAddRefObjField =  async (val,category) => {
    let keys = _.keys(val)
    for(let key of keys){
        if(!_.includes(aggsMetaFields,key)){
            if(_.isArray(val[key]['buckets'])){
                val[key] = val[key]['buckets']
                for(let internal_val of val[key]){
                    let ref_category = findRefCategory(category,key),cached_obj
                    if(ref_category){
                        cached_obj = await scirichonCache.getItemByCategoryAndID(ref_category,internal_val.key)
                        if(!_.isEmpty(cached_obj)){
                            internal_val.ref_obj = cached_obj
                        }
                    }
                    await removeBucketAndAddRefObjField(internal_val,category)
                }
            }
        }
    }
    return val
}

const removeIgnoredMetaField =  (val) => {
    if(_.isArray(val)) {
        val = _.map(val, function (val) {
            return removeIgnoredMetaField(val)
        });
    }else if(_.isObject(val)){
        for (let prop in val) {
            if(_.includes(ignoredMetaFields,prop)){
                delete val[prop]
            }
            if(typeof val[prop] === 'object')
                removeIgnoredMetaField(val[prop])
        }
    }
    return val
}

const esResponseMapper = async function(result,params,ctx){
    if(params.aggs){
        result = result.aggregations
        result = await removeBucketAndAddRefObjField(result,params.category)
        result = removeIgnoredMetaField(result)
    }else{
        result =  {count:result.hits.total,results:_.map(result.hits.hits,(result)=>result._source)}
        if(result.count>0&&_.isArray(result.results)){
            result.results = await scirichonResponseMapper.responseMapper(result.results, params)
        }
    }
    return result
}

module.exports = {esResponseMapper,getIndexByCategory}