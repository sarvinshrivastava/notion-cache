const { test } = require('node:test');
const assert = require('node:assert/strict');
const { secretMatches, bearerToken } = require('../src/auth');

const req = authorization => ({ get: name => (name.toLowerCase() === 'authorization' ? authorization : undefined) });

test('bearerToken reads a Bearer header and ignores everything else', () => {
  assert.equal(bearerToken(req(undefined)), '');
  assert.equal(bearerToken(req('Basic x')), '');
  assert.equal(bearerToken(req('bearer  tok')), 'tok');
  assert.equal(bearerToken(req('Bearer abc ')), 'abc');
});

test('secretMatches compares values of different lengths and an empty given', () => {
  assert.equal(secretMatches('s3cret', 's3cret'), true);
  assert.equal(secretMatches('s3cret', 's3cret-longer'), false);
  assert.equal(secretMatches('s3cret', 's3'), false);
  assert.equal(secretMatches('s3cret', ''), false);
  assert.equal(secretMatches('s3cret'), false);
});
