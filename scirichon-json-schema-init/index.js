const init_schema = require('./init_schema')
const init_neo4j = require('./init_neo4j')
const init_es = require('./init_es')

const initialize = async ()=>{
    await init_schema.initialize()
    await init_es.initialize()
    await init_neo4j.initialize()
}

module.exports = {initialize}

