const _ = require('lodash')
const common = require('scirichon-common')
const schema = require('scirichon-json-schema')

let customized_loader = {}

const setLoader = (loader)=>{
    customized_loader = loader
}

const wrapRequest = (category,item) => {
    return {data:{category:category,fields:item}}
}

const getCategoryItems = async (category)=> {
    let schema_obj = schema.getAncestorSchema(category),service_url,result
    if(!schema_obj||!schema_obj.route||!schema_obj.service)
        throw new Error(`${category} api route not found`)
    service_url = common.getServiceApiUrl(schema_obj.service)
    result = await common.apiInvoker('GET', `${service_url}/api${schema_obj.route}`, '', {'original': true})
    return _.map(result.data||result,(item)=>item.uuid)
}

const batchAddItems = async(category,items)=>{
    let load_url,method='POST',result
    if(customized_loader.loadUrl&&customized_loader.loadUrl[category]){
        load_url = customized_loader.loadUrl[category]
    }else{
        let schema_obj = schema.getAncestorSchema(category),service_url
        if(!schema_obj||!schema_obj.route||!schema_obj.service)
            throw new Error(`${category} api route not found`)
        load_url= common.getServiceApiUrl(schema_obj.service)
        load_url = load_url + '/api' + schema_obj.route + '/batch'
    }
    result = await common.apiInvoker(method,load_url,'','',wrapRequest(category,items))
    return result.data||result
}

const loadItemsByBatchSize = async (category,params)=>{
    const num = parseInt(process.env[`${category}Num`])||10,batchSize=parseInt(process.env['BatchSize'])||100
    let round = parseInt(num/batchSize),remainder=num%batchSize,start,end,item,body,items=[],result,ids=[]
    for(let i=0;i<round;i++){
        items = [],start = i*batchSize,end = (i+1)*batchSize
        for(let j=start;j<end;j++){
            params.index = j
            item = await customized_loader.generateItem(category,params)
            items.push(item)
        }
        result = await batchAddItems(category,items)
        ids = ids.concat(result)
        console.log(`load ${category} from ${start} to ${end}`)
    }
    if(remainder){
        start = round>0?end:0
        items = []
        for(let j=start;j<start+remainder;j++){
            params.index = j
            item = await customized_loader.generateItem(category,params)
            items.push(item)
        }
        result = await batchAddItems(category,items)
        ids = ids.concat(result)
    }
    console.log(`load all ${category} success!`)
    return ids
}

module.exports = {
    loadItemsByBatchSize,
    batchAddItems,
    getCategoryItems,
    setLoader
}