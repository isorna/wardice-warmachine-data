import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { extractPublications } from '../extract-warmachine-publications.mjs'

const entity = (id, name, extra = {}) => ({
  guidStr: id,
  name: [name, '', '', '', ''],
  isLive: true,
  deleted: false,
  metadata: '',
  ...extra,
})

test('merges library bundles, resolves hierarchy, preserves order, and copies media', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'warmachine-publications-'))
  const inputDir = path.join(root, 'bundles')
  const mediaRoot = path.join(root, 'media-source')
  const output = path.join(root, 'output')
  await mkdir(inputDir)
  await mkdir(path.join(mediaRoot, 'Lore'), { recursive: true })
  await writeFile(path.join(mediaRoot, 'Lore', 'cover.png'), Buffer.from('png-fixture'))

  const core = {
    bundleName: 'data core',
    libCats: [entity('category', 'Lore', { listSortOrder: 1 })],
    libSubCats: [entity('subcategory', 'Stories', {
      libCatId: 'category',
      pubType: 'Lore',
      iconPath: '/Media/Publications/Lore/cover.png',
    })],
    publications: [entity('publication', 'Test Publication', {
      libCatId: 'category',
      libSubCatId: 'subcategory',
      chapterSorting: ['2:chapter-b', '1:chapter-a'],
      chapterIds: ['chapter-a', 'chapter-b'],
      articleSorting: [],
      articleIds: [],
      description: ['Description'],
      libMediaPath: '/Media/Publications/Lore/cover.png',
      tocMediaPath: '',
      reqSub: true,
      isCore: false,
      showTOC: true,
      libOrder: 7,
    })],
    chapters: [],
    articles: [],
    articleSegments: [],
    helpTerms: [],
  }
  const library = {
    chapters: [
      entity('chapter-a', 'First', { intro: ['A'], articleSorting: ['1:article'], articleIds: ['article'], helpTermIds: [] }),
      entity('chapter-b', 'Second', { intro: ['B'], articleSorting: [], articleIds: [], helpTermIds: [] }),
    ],
    articles: [entity('article', 'Article', { artSegSort: ['1:segment'], artSegIds: ['segment'] })],
    articleSegments: [entity('segment', 'Segment', {
      type: 'Body',
      title: ['Title'],
      body: ['Body'],
      caption: ['Caption'],
      mediaPath: '/Media/Publications/Lore/cover.png',
      helpTermSorting: [],
      helpTermIds: [],
      widthPerc: 80,
      mediaWidth: 10,
      mediaHeight: 20,
      isSub: false,
      colorHex: '',
      textColorHex: '',
      topMarginOverride: -1,
      bottomMarginOverride: -1,
      leftMarginOverride: -1,
      rightMarginOverride: -1,
    })],
  }
  await writeFile(path.join(inputDir, 'data core.json'), JSON.stringify(core))
  await writeFile(path.join(inputDir, 'data library test publication.bundle.json'), JSON.stringify(library))

  const report = await extractPublications({ input: null, inputDir, mediaRoot, output, copyMedia: true })
  assert.equal(report.issueCount, 0)
  assert.equal(report.counts.inputBundles, 2)
  assert.equal(report.counts.mediaFiles, 1)

  const catalog = JSON.parse(await readFile(path.join(output, 'catalog.json'), 'utf8'))
  const publication = JSON.parse(await readFile(path.join(output, catalog.publications[0].file), 'utf8'))
  assert.deepEqual(publication.chapters.map((chapter) => chapter.id), ['chapter-a', 'chapter-b'])
  assert.equal(publication.chapters[0].articles[0].segments[0].body[0], 'Body')
  assert.equal(publication.libraryMedia.outputPath, 'media/Lore/cover.png')
  assert.equal(publication.requiresSubscription, true)
})
