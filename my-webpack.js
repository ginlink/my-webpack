const fs = require('fs')
const parser = require('@babel/parser')
const traverse = require('@babel/traverse').default
const babel = require('@babel/core')
const path = require('path')

let ID = 0 // 模块唯一标识

function createAsset(filename) {
  // 1.分析依赖
  // 2.转化代码

  const content = fs.readFileSync(filename, 'utf-8')
  const ast = parser.parse(content, { sourceType: 'module' })

  const dependencies = []

  traverse(ast, {
    ImportDeclaration: ({ node }) => {
      dependencies.push(node.source.value)
    }
  })

  const { code } = babel.transformFromAstSync(ast, null, {
    presets: ['@babel/preset-env']
  })

  const id = ID++

  return {
    id,
    filename,
    code,
    dependencies
  }
}

function createGraph(entry) {
  // 1.循环分析
  // 2.增加相对路径映射（目的是在构建module的时候能够通过相对路径找到模块）

  const rootAsset = createAsset(entry)
  const queue = [rootAsset]

  for (let i = 0;i < queue.length;++i) {
    const asset = queue[i]
    const dirname = path.dirname(asset.filename)

    asset.mapping = {}

    asset.dependencies.forEach((relativePath) => {
      const absolutePath = path.join(dirname, relativePath)
      const child = createAsset(absolutePath)

      asset.mapping[relativePath] = child.id

      queue.push(child)
    })
  }

  return queue
}

function buddle(graph) {
  // 1.构建modules
  // 2.根据cjs规范构建结果

  let modules = ''

  graph.forEach((mod) => {
    modules += `
      ${mod.id}: [
        function(require, module, exports){
          ${mod.code}
        },
        ${JSON.stringify(mod.mapping)}
      ],
    `
  })

  const result = `
    (function(modules){
      function require(id){
        const [fn, mapping] = modules[id]

        function localRequire(relativePath) {
          return require(mapping[relativePath])
        }
        
        const module = {
          exports: {}
        }

        fn(localRequire, module, module.exports)

        return module.exports
      }

      require(0)
    })({${modules}})
  `

  return result
}

function writeTarget(filename, data) {
  fs.writeFileSync(filename, data)
}

function main() {
  try {
    const graph = createGraph('./src/index.js')
    const result = buddle(graph)
    writeTarget('./dist/buddle.js', result)

    console.log('[buddle success]:',)
  } catch (err) {
    console.log('[err]:', err)
  }
}

main()
