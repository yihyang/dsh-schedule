/**
 * HTTP 层 CSRF 防护单测：Host 白名单（防 DNS rebinding）、Origin/Host 同源
 * 校验、Content-Type 严格校验。
 */
import { describe, expect, it } from 'vitest'
import { hasJsonContentType, isTrustedHost, isTrustedOrigin, type RequestHeadersLike, type WebServerBinding } from './http'

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

  it('Origin 为空字符串时拒绝（异常值不应默认放行）', () => {
    expect(isTrustedOrigin(req({ origin: '', host: '127.0.0.1:8080' }))).toBe(false)
  })

  it('Origin 为字面量 "null"（沙箱 iframe/file:// 等不透明来源）时拒绝', () => {
    expect(isTrustedOrigin(req({ origin: 'null', host: '127.0.0.1:8080' }))).toBe(false)
  })

  it('IPv6 回环地址同源时可信', () => {
    expect(isTrustedOrigin(req({ origin: 'http://[::1]:8080', host: '[::1]:8080' }))).toBe(true)
  })
})

describe('isTrustedHost（防 DNS rebinding）', () => {
  const loopback: WebServerBinding = { host: '127.0.0.1', port: 8080 }

  it('回环绑定下，Host 为 127.0.0.1:<port> 时可信', () => {
    expect(isTrustedHost('127.0.0.1:8080', loopback)).toBe(true)
  })

  it('回环绑定下，Host 为 localhost:<port> 时可信', () => {
    expect(isTrustedHost('localhost:8080', loopback)).toBe(true)
  })

  it('回环绑定下，Host 为 [::1]:<port> 时可信', () => {
    expect(isTrustedHost('[::1]:8080', loopback)).toBe(true)
  })

  it('大小写不敏感', () => {
    expect(isTrustedHost('LOCALHOST:8080', loopback)).toBe(true)
  })

  it('回环绑定下，DNS rebinding 后的攻击域名 Host 被拒绝', () => {
    // 攻击域名的 DNS 记录重新解析指向 127.0.0.1，但浏览器发出请求时
    // Host 头仍是原始域名（取自 URL），不会变成 127.0.0.1。
    expect(isTrustedHost('evil.example:8080', loopback)).toBe(false)
  })

  it('回环绑定下，端口不匹配时拒绝', () => {
    expect(isTrustedHost('127.0.0.1:9999', loopback)).toBe(false)
  })

  it('回环绑定下，缺失 Host 时拒绝', () => {
    expect(isTrustedHost(undefined, loopback)).toBe(false)
  })

  it('绑定 0.0.0.0（管理员已主动放宽）时放行任意 Host', () => {
    const wide: WebServerBinding = { host: '0.0.0.0', port: 8080 }
    expect(isTrustedHost('evil.example:8080', wide)).toBe(true)
    expect(isTrustedHost(undefined, wide)).toBe(true)
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

  it('拒绝 multipart/form-data（表单可达的第三种编码）', () => {
    expect(hasJsonContentType(req({ 'content-type': 'multipart/form-data; boundary=----x' }))).toBe(false)
  })

  it('缺失 Content-Type 时拒绝', () => {
    expect(hasJsonContentType(req({}))).toBe(false)
  })
})
