import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
});

process.env.GOOGLE_CLIENT_ID ??= 'test-google-client-id';
process.env.GOOGLE_CLIENT_SECRET ??= 'test-google-client-secret';
process.env.GOOGLE_OAUTH_REDIRECT_URI ??= 'http://localhost:3000/api/auth/google/callback';
process.env.SESSION_SECRET ??= 'X+DpWZmHM4nF4gAZyPoskcUFw2GhYvt3fxLEgXf5sis=';
process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ??=
  'test-service-account@test-project.iam.gserviceaccount.com';
process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY ??= [
  '-----BEGIN PRIVATE KEY-----',
  'MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCsAYKggtFSBjRO',
  'M7SMr95J8xCo7XbqYWIe/GL/7oZ0xjO5pgjTpKXp52XbUVEhjoc3j7gNkNLrc3g/',
  '4rWtDgvU/v9b7rTl2sKQ6RVZX8qOjN2I0IAOLKiIsXCBMWGRKm307gdHHGdRkB0c',
  'KHDPKEMqC54BlSmmc5HtSnPJrGfuQ6kFvVEMAXlSn0mfSqmm8MMAS1nGMeQTOgba',
  'F9th7YVUK1TSOcpIUnG4WbV/ImvsrqGJsW0sIg8VxbMzQ6fC69lLIQYux4qUqDHy',
  'P5J8atsvVJyU9zXEsIY7WhF567WyH9hQLwfNswucCMEJrcGEEG6f3Bmpnb1lZ63K',
  'uOfMZWQnAgMBAAECggEANv++oItj2gnw1KaUzz124wdtJs7TbMtZwBWspDBFXvZ3',
  'WJ/eB6qIgLvEZnXgbs3vr5TtYa0SvEWuSCM6O00X/HHS/jbcMfkaqJJXCL5n+t/R',
  'AGvG3oFqHFc8ZZsAGxZJlX0854COCtb9b+EAfUTfAQU470GeUUJ4ATuCvZQ6oUUL',
  'ZR0RqkwpjwAKx58rdwZK68cKRE1zHSn1l/2NVtS8Y95J9qd9JzMVoUKuQZiZAtG/',
  'JraMVUhFi4ZwpLu6U5MpAtFN23SFmZRDPVnTAmhU/tBk9F9k+DdjazgtTjGXK4K9',
  'VrA98edloIH5oD7xd5nf4ZkkmDHC9gZ+Rmq6hNisGQKBgQDnOewRxs2pXH5ZB9Ad',
  'P2rTdRu7w7BDoYbbzhbCwvK6fpBuKHBdgU5jwlgyACrYFILSbqxECYB7lySyyYsW',
  'PhXWbti2M8rnqmSJ7tk/3F7DH2X0nEmvm1rmQW54Nevj8uKV9DRfxxmrUyUsodlS',
  '8y789uE/+c6+snbIlbAehmvtWQKBgQC+b0qD/S7Ub877oI/rgBMulduDXJlxjNyw',
  'PIUQxf9wHUncFzWY2Ht6SQyIWT0X6qINMhm9E9eLRogUAxMVuH43nGrmorNfyoJw',
  'O2LyVs5USYDSVzEKj6FCyEvYUmwHBXdWcBFlPkVh0zzw1ocNBIp+hjSpc9JmwSSg',
  'wo4DNvItfwKBgQCtiJH8MWiuH4WPicaN/MdOlchPnajOyQ4uLrh0SNzkTBJXKjBS',
  'bLYJNpT8SZXd/17DUV4l3b+4gZGAQLQK6GN5QE2SSMKSJRY5UrFnNRtFc24QK689',
  'hOmufxLKUyWLOQEGq3UXIJTKOKdgnMM+dtYf8aTRX8ji44s0NOstrZKYWQKBgEIE',
  '0xBu9Y0wNdGGGF7MR9oembswnwF+lAOE95yZB7UWckSaxzn10tjR+kZKqaNg9E0e',
  '0U17U341NXe6mSMukpM05tqODSFoU1AVRng9H8qYsNA66gV/RaihR6n26PyGKJkO',
  'wPkYXXVMhhP4S1l3+Ytje15DiO2Wh9wzlogGxG6BAoGAAaUMiBH073GmxSxXqDX3',
  'Wt4p2QN5lEtkhe8WJAMnAsXWHI3OtHPi3paxfLhaIXf6kYjEvMYLMmuen2wXEy1n',
  '674/6pNaPi/FzhBcYIJc+a9OPOM74BRGaMpx/6bv44v29OQV5DJbpyWvs+n4bOsB',
  '1vzgKRSMUK4qwRreKbz3Mb0=',
  '-----END PRIVATE KEY-----',
  '',
].join('\\n');
process.env.GOOGLE_SHEET_ID ??= 'test-sheet-id';
process.env.ALLOWED_GOOGLE_EMAIL ??= 'owner@example.com';
process.env.APP_TIME_ZONE ??= 'Europe/Oslo';
