const schema = require('../index')
const assert = require('chai').assert


describe("scirichon-json-schema", () => {

    const prefix = process.env['SCHEMA_TYPE']||"scirichon-test";
    const redisOption = {
        host: process.env.REDIS_HOST || "127.0.0.1",
        auth_pass: process.env.REDIS_AUTH  || "admin"
    };
    const option = {redisOption,prefix}

    before(async () => {
        await schema.initSchemas(option)
    })

    after(async () => {
        await schema.clearSchemas()
    })

    beforeEach(async() => {

    })

    it("check schema", () => {
        let objectProperties = schema.getSchemaObjectProperties('PhysicalServer')
        assert.equal(objectProperties.length,5)
        let referenceProperties = schema.getSchemaRefProperties('PhysicalServer')
        assert.equal(referenceProperties.length,6)
        let ancestorCategory = schema.getAncestorCategory('PhysicalServer')
        assert.equal(ancestorCategory,'ConfigurationItem')
        assert.equal(schema.getRouteCategories().length,1)
        let obj = {
            "name": "AS-2285-BAK",
            "it_service": ["{{service_email_id}}", "{{service_pop3_id}}"],
            "ip_address": ["192.168.0.108"],
            "technical_support_info": "010-123456",
            "operating_system": "{{ubuntu_os_id}}",
            "storage_info": "hp-disk1",
            "model": "b10",
            "product_date": "2016-10-11",
            "warranty_expiration_date": "2016-11-11",
            "retirement_date": "2017-02-11",
            "asset_location": {"status": "on_shelf", "shelf": "{{shelf_id}}", "label": "label", "other": "other"},
            "management_ip": "192.168.0.108",
            "monitored": true,
            "asset_id": "test"
        }
        assert.throws(()=>schema.checkObject('PhysicalServer',obj),Error,'data.management_ip should be array')
    });
})
