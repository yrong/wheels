const uuid = require("uuid")
const path = require("path")
const mount = require("koa-mount")
const parse = require("async-busboy")
// let store = require('./nc')

const fileUpload = (opts) => {

    let store
    try {
        store = require(`./${opts.provider}`)(opts)
    } catch (err) {
        throw new Error(`Error: ${err}`)
    }
    if(!opts.filename)
        opts.filename = (file)=>file.filename

    const {mimetypes, exts, filename} = opts

    const handler = async (ctx, next) => {
        // Validate Request
        if ("POST" !== ctx.method && !ctx.request.is("multipart/*")) {
            return await next()
        }

        // Parse request for multipart
        const {files, fields} = await parse(ctx.req)

        // Check if any file is not valid mimetype
        if (mimetypes) {
            const invalidFiles = files.filter(file => {
                return !mimetypes.includes(file.mimeType)
            })

            // Return err if any not valid
            if (invalidFiles.length !== 0) {
                ctx.status = 400
                ctx.body = `Error: Invalid type of files ${invalidFiles.map(file => `${file.filename}[${file.mimeType}]`)}`
                return
            }
        }

        // Check if any file is not valid ext
        if (exts) {
            const invalidFiles = files.filter(file => {
                return !exts.includes(file.filename.substring(file.filename.lastIndexOf('.') + 1))
            })

            // Return err if any not valid
            if (invalidFiles.length !== 0) {
                ctx.status = 400
                ctx.body = `Error: Invalid type of files ${invalidFiles.map(file => file.filename)}`
                return
            }
        }

        // Generate oss path
        let result = {}
        const storeDir = opts.storeDir ? `${opts.storeDir}/` : ''
        files.forEach(file => {
            const fileId = typeof filename === 'function' ?
                filename(file) : `${uuid.v4()}${path.extname(file.filename)}`
            result[file.filename] = {
                storeDir: `${storeDir}`,
                fileId: fileId,
            }
        })

        // Upload to OSS or folders
        try {
            await Promise.all(files.map(file => {
                const { storeDir, fileId } = result[file.filename]
                return store.put(`${storeDir}/${fileId}`, file)
            }))
        } catch (err) {
            ctx.status = 500
            ctx.body = `Error: ${err}`
            return
        }

        // Return result
        ctx.status = 200
        Object.keys(result).forEach(filename => {
            const { storeDir, fileId } = result[filename]
            result[filename] = `${storeDir}/${encodeURI(fileId)}`
        })
        ctx.body = await store.get(result)
    }
    return {handler,store}
}

module.exports = (options) => {
    if (!options.url) {
        throw new Error('Can not find option url')
    }
    return fileUpload(options)
}