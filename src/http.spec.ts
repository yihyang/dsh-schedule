/**
 * HTTP 层 CSRF 防护单测：Origin/Host 同源校验、Content-Type 严格校验。
 */
import { describe, expect, it } from 'vitest'
import { hasJsonContentType, isTrustedOrigin, type RequestHeadersLike } from './http'

function req(headers: Partial<RequestHeadersLike['headers']>): RequestHeadersLike {
  return { headers: headers as RequestHeadersLike['headers'] }
}

describe('isTrustedOrigin', () => {
  it('无 Origin 头（本机脚本/curl）视为可信', () => {
    expect(isTrustedOrigin(req({ host: '127.0.0.1:8080' }))).toBe(true)
  })

  it('Origin 与 Host 同源时可信', () => {
    expect(isTrustedOrigin(req({ origin: 'http://127.0.0.1:8080', host: '127.0.0.1:8080' }))).toBe(true)
  })

  it('Origin 与 Host 不同源时拒绝（跨站请求）', () => {
    expect(isTrustedOrigin(req({ origin: 'https://evil.example', host: '127.0.0.1:8080' }))).toBe(false)
  })

  it('端口不同也视为不同源', () => {
    expect(isTrustedOrigin(req({ origin: 'http://127.0.0.1:9999', host: '127.0.0.1:8080' }))).toBe(false)
  })

  it('有 Origin 但缺 Host 时拒绝', () => {
    expect(isTrustedOrigin(req({ origin: 'http://127.0.0.1:8080' }))).toBe(false)
  })

  it('Origin 非法 URL 时拒绝', () => {
    expect(isTrustedOrigin(req({ origin: 'not-a-url', host: '127.0.0.1:8080' }))).toBe(false)
  })
})

describe('hasJsonContentType', () => {
  it('application/json 通过', () => {
    expect(hasJsonContentType(req({ 'content-type': 'application/json' }))).toBe(true)
  })

  it('带 charset 参数也通过', () => {
    expect(hasJsonContentType(req({ 'content-type': 'application/json; charset=utf-8' }))).toBe(true)
  })

  it('大小写不敏感', () => {
    expect(hasJsonContentType(req({ 'content-type': 'Application/JSON' }))).toBe(true)
  })

  it('拒绝 text/plain（经典 JSON-CSRF 表单绕过编码）', () => {
    expect(hasJsonContentType(req({ 'content-type': 'text/plain' }))).toBe(false)
  })

  it('拒绝 application/x-www-form-urlencoded', () => {
    expect(hasJsonContentType(req({ 'content-type': 'application/x-www-form-urlencoded' }))).toBe(false)
  })

  it('缺失 Content-Type 时拒绝', () => {
    expect(hasJsonContentType(req({}))).toBe(false)
  })
})
