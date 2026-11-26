import { join, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { fileNameScore, freeName, insideRoots, isRunnable, isSearchedFolder } from './paths'

const home = resolve('/home/user')
const documents = join(home, 'Documents')
const downloads = join(home, 'Downloads')

describe('insideRoots', () => {
  it('accepts paths inside a root and the root itself', () => {
    expect(insideRoots(join(documents, 'school', 'essay.docx'), [documents, downloads])).toBe(join(documents, 'school', 'essay.docx'))
    expect(insideRoots(downloads, [documents, downloads])).toBe(downloads)
  })

  it('rejects paths outside the roots, also through ..', () => {
    expect(() => insideRoots(join(home, 'AppData', 'secret.txt'), [documents])).toThrow('outside')
    expect(() => insideRoots(join(documents, '..', 'AppData'), [documents])).toThrow('outside')
    expect(() => insideRoots(join(`${documents}-copy`, 'a.txt'), [documents])).toThrow('outside')
  })

  it('rejects relative paths', () => {
    expect(() => insideRoots('essay.docx', [documents])).toThrow('not a full path')
  })
})

describe('isRunnable', () => {
  it('flags files that run code', () => {
    expect(isRunnable('setup.EXE')).toBe(true)
    expect(isRunnable('script.ps1')).toBe(true)
    expect(isRunnable('shortcut.lnk')).toBe(true)
    expect(isRunnable('photo.jpg')).toBe(false)
    expect(isRunnable('notes.txt')).toBe(false)
  })
})

describe('isSearchedFolder', () => {
  it('skips hidden and app folders', () => {
    expect(isSearchedFolder('School')).toBe(true)
    expect(isSearchedFolder('.cache')).toBe(false)
    expect(isSearchedFolder('node_modules')).toBe(false)
    expect(isSearchedFolder('AppData')).toBe(false)
  })
})

describe('fileNameScore', () => {
  it('needs every word and ranks exact and leading matches higher', () => {
    expect(fileNameScore('resume.pdf', 'resume')).toBe(4)
    expect(fileNameScore('Resume 2026.pdf', 'resume')).toBe(3)
    expect(fileNameScore('My Resume.pdf', 'resume')).toBe(2)
    expect(fileNameScore('presumed.txt', 'resume')).toBe(1)
    expect(fileNameScore('Resume 2026.pdf', 'resume 2025')).toBe(0)
  })
})

describe('freeName', () => {
  it('keeps a free name and numbers a taken one', () => {
    expect(freeName('photo.jpg', new Set())).toBe('photo.jpg')
    expect(freeName('photo.jpg', new Set(['photo.jpg', 'photo (2).jpg']))).toBe('photo (3).jpg')
  })
})
