#!/usr/bin/env node

import { createHash } from 'node:crypto'
import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const DEFAULT_DATA_REPO =
  process.env.WARDICE_WARMACHINE_DATA_REPO || 'E:\\wardice-warmachine-data'
const DEFAULT_APP_DATA =
  process.env.WARMACHINE_APP_DATA ||
  path.join(
    process.env.USERPROFILE || 'C:\\Users\\User',
    'AppData',
    'LocalLow',
    'Privateer Press',
    'Warmachine App',
  )

function parseArgs(argv) {
  const options = {
    inputDir: path.join(
      DEFAULT_DATA_REPO,
      'output',
      'warmachine-app',
      'bundles',
    ),
    input: null,
    mediaRoot: path.join(
      DEFAULT_APP_DATA,
      'public-20',
      'Media',
      'Publications',
    ),
    output: path.join(
      DEFAULT_DATA_REPO,
      'output',
      'warmachine-app',
      'publications',
    ),
    copyMedia: true,
    quiet: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--input') options.input = argv[++index]
    else if (argument === '--input-dir') options.inputDir = argv[++index]
    else if (argument === '--media-root') options.mediaRoot = argv[++index]
    else if (argument === '--output') options.output = argv[++index]
    else if (argument === '--no-copy-media') options.copyMedia = false
    else if (argument === '--quiet') options.quiet = true
    else if (argument === '--help' || argument === '-h') options.help = true
    else throw new Error(`Unknown argument: ${argument}`)
  }

  for (const [name, value] of Object.entries(options)) {
    if (name !== 'help' && typeof value === 'undefined') {
      throw new Error(`Missing value for --${name}`)
    }
  }

  return options
}

function usage() {
  return `Extract Warmachine App publications into Wardice-ready JSON.

Usage:
  node scripts/extract-warmachine-publications.mjs [options]

Options:
  --input <data-core.json>       Use one extracted JSON bundle only
  --input-dir <directory>        Merge data core + extracted data library JSON
  --media-root <directory>       Local Media/Publications cache
  --output <directory>           Destination directory
  --no-copy-media                Keep media references without copying PNG files
  --quiet                        Write files without printing the full report
  -h, --help                     Show this help

Environment:
  WARDICE_WARMACHINE_DATA_REPO   Defaults to E:\\wardice-warmachine-data
  WARMACHINE_APP_DATA            Defaults to the current user's LocalLow app data
`
}

function asArray(value) {
  if (Array.isArray(value)) return value
  if (value === null || typeof value === 'undefined' || value === '') return []
  return [value]
}

function displayText(value) {
  return asArray(value).find((entry) => typeof entry === 'string' && entry.trim()) || ''
}

function slugify(value) {
  return (
    value
      .replace(/\\[nr]/gi, ' ')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'publication'
  )
}

function indexById(items) {
  return new Map(asArray(items).map((item) => [item.guidStr, item]))
}

function orderedIds(sortEntries, fallbackIds) {
  const parsed = asArray(sortEntries)
    .map((entry, sourceIndex) => {
      const value = String(entry)
      const separator = value.indexOf(':')
      if (separator < 0) {
        return { id: value, order: Number.POSITIVE_INFINITY, sourceIndex }
      }
      const prefix = Number.parseFloat(value.slice(0, separator))
      return {
        id: value.slice(separator + 1),
        order: Number.isFinite(prefix) ? prefix : Number.POSITIVE_INFINITY,
        sourceIndex,
      }
    })
    .filter(({ id }) => id)
    .sort((left, right) => left.order - right.order || left.sourceIndex - right.sourceIndex)

  const result = []
  const seen = new Set()
  for (const { id } of parsed) {
    if (!seen.has(id)) {
      result.push(id)
      seen.add(id)
    }
  }
  for (const id of asArray(fallbackIds)) {
    if (id && !seen.has(id)) {
      result.push(id)
      seen.add(id)
    }
  }
  return result
}

function mediaReference(sourcePath) {
  if (!sourcePath) return null
  const normalized = String(sourcePath).replaceAll('\\', '/')
  const marker = '/Media/Publications/'
  const markerIndex = normalized.toLowerCase().indexOf(marker.toLowerCase())
  if (markerIndex < 0) {
    return {
      sourcePath: normalized,
      outputPath: null,
    }
  }
  const relative = normalized.slice(markerIndex + marker.length)
  return {
    sourcePath: normalized,
    outputPath: `media/${relative}`,
  }
}

function publicEntity(entity, extra = {}) {
  return {
    id: entity.guidStr,
    name: displayText(entity.name),
    names: asArray(entity.name),
    isLive: Boolean(entity.isLive),
    deleted: Boolean(entity.deleted),
    metadata: entity.metadata || '',
    ...extra,
  }
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}

async function listFiles(root) {
  const files = []
  async function walk(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name)
      if (entry.isDirectory()) await walk(absolute)
      else if (entry.isFile()) files.push(absolute)
    }
  }
  await walk(root)
  return files.sort((left, right) => left.localeCompare(right))
}

async function copyPublicationMedia(mediaRoot, outputRoot) {
  const mediaFiles = await listFiles(mediaRoot)
  const manifest = []
  for (const source of mediaFiles) {
    const relative = path.relative(mediaRoot, source)
    const destination = path.join(outputRoot, 'media', relative)
    const buffer = await readFile(source)
    await mkdir(path.dirname(destination), { recursive: true })
    await copyFile(source, destination)
    manifest.push({
      path: `media/${relative.replaceAll('\\', '/')}`,
      bytes: buffer.byteLength,
      sha256: sha256(buffer),
    })
  }
  return manifest
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function collectMediaPaths(value, target) {
  if (Array.isArray(value)) {
    for (const item of value) collectMediaPaths(item, target)
    return
  }
  if (!value || typeof value !== 'object') return
  if (typeof value.outputPath === 'string' && value.outputPath) target.add(value.outputPath)
  for (const child of Object.values(value)) collectMediaPaths(child, target)
}
const MERGED_COLLECTIONS = [
  'libCats',
  'libSubCats',
  'publications',
  'chapters',
  'articles',
  'articleSegments',
  'helpTerms',
]

async function loadInput(options) {
  const inputFiles = options.input
    ? [path.resolve(options.input)]
    : (await readdir(path.resolve(options.inputDir), { withFileTypes: true }))
        .filter(
          (entry) =>
            entry.isFile() &&
            /^data (?:core|library).*\.json$/i.test(entry.name) &&
            !/^data core (?:general|strings)\.json$/i.test(entry.name),
        )
        .map((entry) => path.join(path.resolve(options.inputDir), entry.name))
        .sort((left, right) => left.localeCompare(right))

  if (!inputFiles.length) {
    throw new Error('No data core/data library JSON bundles were found')
  }

  const documents = await Promise.all(
    inputFiles.map(async (filePath) => ({
      filePath,
      data: JSON.parse(await readFile(filePath, 'utf8')),
    })),
  )
  const core = documents.find(({ filePath }) => /^data core\.json$/i.test(path.basename(filePath)))
  if (!core) throw new Error('The input set does not contain data core.json')

  const merged = { ...core.data }
  for (const collection of MERGED_COLLECTIONS) {
    const byId = new Map()
    for (const { data } of documents) {
      for (const entity of asArray(data[collection])) {
        if (entity?.guidStr) byId.set(entity.guidStr, entity)
      }
    }
    merged[collection] = [...byId.values()]
  }
  return { data: merged, inputFiles }
}
function createResolver(data, issues) {
  const helpTerms = indexById(data.helpTerms)
  const segments = indexById(data.articleSegments)
  const articles = indexById(data.articles)
  const chapters = indexById(data.chapters)

  function missing(kind, id, owner) {
    issues.push({ kind: `missing${kind}`, id, owner })
    return {
      id,
      missing: true,
    }
  }

  function resolveHelpTerm(id, owner) {
    const term = helpTerms.get(id)
    if (!term) return missing('HelpTerm', id, owner)
    return publicEntity(term, {
      description: asArray(term.description),
      aliases: asArray(term.aliases),
    })
  }

  function resolveSegment(id, owner) {
    const segment = segments.get(id)
    if (!segment) return missing('ArticleSegment', id, owner)
    return publicEntity(segment, {
      type: segment.type || '',
      title: asArray(segment.title),
      body: asArray(segment.body),
      caption: asArray(segment.caption),
      media: mediaReference(segment.mediaPath),
      layout: {
        widthPercent: segment.widthPerc,
        mediaWidth: segment.mediaWidth,
        mediaHeight: segment.mediaHeight,
        isSubsection: Boolean(segment.isSub),
        color: segment.colorHex || null,
        textColor: segment.textColorHex || null,
        margins: {
          top: segment.topMarginOverride,
          bottom: segment.bottomMarginOverride,
          left: segment.leftMarginOverride,
          right: segment.rightMarginOverride,
        },
      },
      helpTerms: orderedIds(segment.helpTermSorting, segment.helpTermIds).map((termId) =>
        resolveHelpTerm(termId, `segment:${id}`),
      ),
    })
  }

  function resolveArticle(id, owner) {
    const article = articles.get(id)
    if (!article) return missing('Article', id, owner)
    return publicEntity(article, {
      segments: orderedIds(article.artSegSort, article.artSegIds).map((segmentId) =>
        resolveSegment(segmentId, `article:${id}`),
      ),
    })
  }

  function resolveChapter(id, owner) {
    const chapter = chapters.get(id)
    if (!chapter) return missing('Chapter', id, owner)
    return publicEntity(chapter, {
      intro: asArray(chapter.intro),
      helpTerms: asArray(chapter.helpTermIds).map((termId) =>
        resolveHelpTerm(termId, `chapter:${id}`),
      ),
      articles: orderedIds(chapter.articleSorting, chapter.articleIds).map((articleId) =>
        resolveArticle(articleId, `chapter:${id}`),
      ),
    })
  }

  return {
    resolveArticle,
    resolveChapter,
  }
}

export async function extractPublications(options) {
  const mediaRoot = path.resolve(options.mediaRoot)
  const outputRoot = path.resolve(options.output)
  const { data: input, inputFiles } = await loadInput(options)

  for (const collection of [
    'libCats',
    'libSubCats',
    'publications',
    'chapters',
    'articles',
    'articleSegments',
  ]) {
    if (!Array.isArray(input[collection])) {
      throw new Error(`Input is missing the ${collection} array`)
    }
  }

  await mkdir(outputRoot, { recursive: true })
  await rm(path.join(outputRoot, 'publications'), { recursive: true, force: true })
  await rm(path.join(outputRoot, 'media'), { recursive: true, force: true })

  const issues = []
  const categoryIndex = indexById(input.libCats)
  const subcategoryIndex = indexById(input.libSubCats)
  const { resolveArticle, resolveChapter } = createResolver(input, issues)
  const publicationFiles = []
  const catalogPublications = []
  const referencedMediaPaths = new Set()

  for (const publication of input.publications) {
    const category = categoryIndex.get(publication.libCatId)
    const subcategory = subcategoryIndex.get(publication.libSubCatId)
    if (publication.libCatId && !category) {
      issues.push({
        kind: 'missingCategory',
        id: publication.libCatId,
        owner: `publication:${publication.guidStr}`,
      })
    }
    if (publication.libSubCatId && !subcategory) {
      issues.push({
        kind: 'missingSubcategory',
        id: publication.libSubCatId,
        owner: `publication:${publication.guidStr}`,
      })
    }

    const name = displayText(publication.name)
    const issueStart = issues.length
    const fileName = `${slugify(name)}.${publication.guidStr}.json`
    const resolved = publicEntity(publication, {
      description: asArray(publication.description),
      requiresSubscription: Boolean(publication.reqSub),
      isCore: Boolean(publication.isCore),
      showTableOfContents: Boolean(publication.showTOC),
      order: publication.libOrder,
      category: category
        ? publicEntity(category, { order: category.listSortOrder })
        : publication.libCatId
          ? missingReference(publication.libCatId)
          : null,
      subcategory: subcategory
        ? publicEntity(subcategory, {
            publicationType: subcategory.pubType || '',
            icon: mediaReference(subcategory.iconPath),
          })
        : publication.libSubCatId
          ? missingReference(publication.libSubCatId)
          : null,
      libraryMedia: mediaReference(publication.libMediaPath),
      tableOfContentsMedia: mediaReference(publication.tocMediaPath),
      chapters: orderedIds(publication.chapterSorting, publication.chapterIds).map(
        (chapterId) => resolveChapter(chapterId, `publication:${publication.guidStr}`),
      ),
      articles: orderedIds(publication.articleSorting, publication.articleIds).map(
        (articleId) => resolveArticle(articleId, `publication:${publication.guidStr}`),
      ),
    })

    collectMediaPaths(resolved, referencedMediaPaths)
    await writeJson(path.join(outputRoot, 'publications', fileName), resolved)
    const missingContentReferences = issues.length - issueStart
    const contentNodes = [...resolved.chapters, ...resolved.articles]
    const availableContentNodes = contentNodes.filter((node) => !node.missing).length
    const contentStatus = missingContentReferences === 0
      ? 'complete'
      : availableContentNodes === 0
        ? 'unavailable'
        : 'partial'
    publicationFiles.push(fileName)
    catalogPublications.push({
      id: publication.guidStr,
      name,
      names: asArray(publication.name),
      isLive: Boolean(publication.isLive),
      deleted: Boolean(publication.deleted),
      requiresSubscription: Boolean(publication.reqSub),
      isCore: Boolean(publication.isCore),
      contentStatus,
      missingContentReferences,
      order: publication.libOrder,
      categoryId: publication.libCatId || null,
      categoryName: category ? displayText(category.name) : null,
      subcategoryId: publication.libSubCatId || null,
      subcategoryName: subcategory ? displayText(subcategory.name) : null,
      libraryMedia: mediaReference(publication.libMediaPath),
      file: `publications/${fileName}`,
    })
  }

  catalogPublications.sort(
    (left, right) =>
      (left.categoryName || '').localeCompare(right.categoryName || '') ||
      (left.subcategoryName || '').localeCompare(right.subcategoryName || '') ||
      numericOrder(left.order) - numericOrder(right.order) ||
      left.name.localeCompare(right.name),
  )

  let mediaManifest = []
  if (options.copyMedia) {
    const mediaStats = await stat(mediaRoot)
    if (!mediaStats.isDirectory()) throw new Error(`Media root is not a directory: ${mediaRoot}`)
    mediaManifest = await copyPublicationMedia(mediaRoot, outputRoot)
    await writeJson(path.join(outputRoot, 'media-manifest.json'), {
      schemaVersion: 1,
      files: mediaManifest,
    })
  } else {
    await rm(path.join(outputRoot, 'media-manifest.json'), { force: true })
  }

  const categories = input.libCats.map((category) =>
    publicEntity(category, {
      order: category.listSortOrder,
      subcategories: input.libSubCats
        .filter((subcategory) => subcategory.libCatId === category.guidStr)
        .map((subcategory) =>
          publicEntity(subcategory, {
            publicationType: subcategory.pubType || '',
            icon: mediaReference(subcategory.iconPath),
          }),
        ),
    }),
  )

  collectMediaPaths(categories, referencedMediaPaths)
  collectMediaPaths(catalogPublications, referencedMediaPaths)
  if (options.copyMedia) {
    const availableMediaPaths = new Set(mediaManifest.map((entry) => entry.path.toLowerCase()))
    for (const mediaPath of [...referencedMediaPaths].sort()) {
      if (!availableMediaPaths.has(mediaPath.toLowerCase())) {
        issues.push({ kind: 'missingMedia', path: mediaPath })
      }
    }
  }

  const catalog = {
    schemaVersion: 1,
    source: {
      bundleName: input.bundleName || null,
      inputFiles: inputFiles.map((filePath) => path.basename(filePath)),
    },
    categories,
    publications: catalogPublications,
  }
  await writeJson(path.join(outputRoot, 'catalog.json'), catalog)

  const issueCounts = Object.fromEntries(
    [...new Set(issues.map((issue) => issue.kind))]
      .sort()
      .map((kind) => [kind, issues.filter((issue) => issue.kind === kind).length]),
  )
  const report = {
    schemaVersion: 1,
    source: {
      inputFiles,
      mediaRoot,
    },
    output: outputRoot,
    counts: {
      categories: input.libCats.length,
      subcategories: input.libSubCats.length,
      publications: input.publications.length,
      livePublications: input.publications.filter((item) => item.isLive && !item.deleted).length,
      subscriptionRequired: input.publications.filter((item) => item.reqSub).length,
      chapters: input.chapters.length,
      articles: input.articles.length,
      articleSegments: input.articleSegments.length,
      publicationFiles: publicationFiles.length,
      mediaFiles: mediaManifest.length,
      inputBundles: inputFiles.length,
    },
    issueCount: issues.length,
    issueCounts,
    issues,
  }
  await writeJson(path.join(outputRoot, 'extraction-report.json'), report)
  return report
}

function numericOrder(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : Number.POSITIVE_INFINITY
}

function missingReference(id) {
  return { id, missing: true }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    process.stdout.write(usage())
    return
  }
  const report = await extractPublications(options)
  if (!options.quiet) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  if (report.issueCount) process.exitCode = 2
}

const isDirectExecution =
  process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
if (isDirectExecution) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`)
    process.exitCode = 1
  })
}
