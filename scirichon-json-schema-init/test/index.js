const schema = require('scirichon-json-schema')
const init = require('../index')
const assert = require('chai').assert


describe("scirichon-json-schema-init", () => {


    before(async () => {
        await init.initialize()
    })

    after(async () => {
        await schema.clearSchemas()
    })

    beforeEach(async() => {

    })

    it("check schema", () => {
        let objectProperties = schema.getSchemaObjectProperties('PhysicalServer')
        assert.equal(objectProperties.length,5)
        let ancestorCategory = schema.getAncestorCategory('PhysicalServer')
        assert.equal(ancestorCategory,'ConfigurationItem')
        console.log(schema.getRouteCategories())
        assert.equal(schema.getRouteCategories().length,2)
    });
})
