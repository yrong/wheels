const fs = require("fs")
const path = require("path")
const mkdirp = require("mkdirp")

module.exports = (options) => {
    if (!(options.folder)) {
        throw new Error("Missing option in options: [folder]")
    }

    if (!options.urlPath) {
        options.urlPath = options.folder
    }

    return {
        put: (filePath, file) => {
            return new Promise((resolve, reject) => {
                let absoluteFilePath = path.join(process.cwd(), options.folder, filePath)
                mkdirp.sync(path.dirname(absoluteFilePath))
                const stream = fs.createWriteStream(absoluteFilePath)
                file.pipe(stream)
                file.on("end", () => { return resolve(filePath) })
            })
        },
        get: async (result) => {
            Object.keys(result).map(filename => {
                return result[filename] = `${path.join(options.urlPath, result[filename])}`
            })
            return result
        }
    }
}