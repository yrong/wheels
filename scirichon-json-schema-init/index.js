const init_schema = require('./init_schema')
const init_neo4j = require('./init_neo4j')
const init_es = require('./init_es')

const initialize = async ()=>{
    await init_schema.initialize()
    await init_neo4j.initialize()
    if(process.env['ES_SKIP']==true) {
    }else{
        await init_es.initialize()
    }
}

module.exports = {initialize}

