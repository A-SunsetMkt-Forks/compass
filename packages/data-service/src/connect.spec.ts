import { promises as fs } from 'fs';

import createTestEnvs from '@mongodb-js/devtools-docker-test-envs';
import { expect } from 'chai';
import util from 'util';
import ConnectionStringUrl from 'mongodb-connection-string-url';
import path from 'path';
import os from 'os';
import type { MongoClientOptions } from 'mongodb';
import { UUID } from 'mongodb';

import connect from './connect';
import type { ConnectionOptions } from './connection-options';
import type DataService from './data-service';
import { redactConnectionOptions } from './redact';
import { runCommand } from './run-command';
import { MongoLogWriter } from 'mongodb-log-writer';

const IS_CI = process.env.EVERGREEN_BUILD_VARIANT || process.env.CI === 'true';
const SHOULD_DEBUG =
  IS_CI || process.env.DEBUG?.includes('data-service-connect');

const SHOULD_RUN_DOCKER_TESTS = process.env.COMPASS_RUN_DOCKER_TESTS === 'true';

const {
  E2E_TESTS_ATLAS_USERNAME,
  E2E_TESTS_ATLAS_PASSWORD,
  E2E_TESTS_ATLAS_HOST,
  E2E_TESTS_DATA_LAKE_HOST,
  E2E_TESTS_SERVERLESS_HOST,
  E2E_TESTS_FREE_TIER_HOST,
  E2E_TESTS_ANALYTICS_NODE_HOST,
  E2E_TESTS_ATLAS_X509_PEM_BASE64,
} = process.env;

const buildConnectionString = (
  scheme: string,
  username: string | undefined,
  password: string | undefined,
  host: string | undefined,
  params?: MongoClientOptions
): string => {
  if (!username || !password || !host) {
    return '';
  }

  const url = new ConnectionStringUrl(`${scheme}://${host}/admin`);
  url.username = username;
  url.password = password;

  if (params) {
    url.search = new URLSearchParams(params).toString();
  }

  return url.href;
};

const COMPASS_TEST_ATLAS_URL = buildConnectionString(
  'mongodb+srv',
  E2E_TESTS_ATLAS_USERNAME,
  E2E_TESTS_ATLAS_PASSWORD,
  E2E_TESTS_ATLAS_HOST
);

const COMPASS_TEST_FREE_TIER_URL = buildConnectionString(
  'mongodb+srv',
  E2E_TESTS_ATLAS_USERNAME,
  E2E_TESTS_ATLAS_PASSWORD,
  E2E_TESTS_FREE_TIER_HOST
);

const COMPASS_TEST_ANALYTICS_NODE_URL = buildConnectionString(
  'mongodb+srv',
  E2E_TESTS_ATLAS_USERNAME,
  E2E_TESTS_ATLAS_PASSWORD,
  E2E_TESTS_ANALYTICS_NODE_HOST,
  {
    readConcernLevel: 'local',
    readPreference: 'secondary',
    readPreferenceTags: 'nodeType:ANALYTICS',
  }
);

const COMPASS_TEST_SECONDARY_NODE_URL = buildConnectionString(
  'mongodb+srv',
  E2E_TESTS_ATLAS_USERNAME,
  E2E_TESTS_ATLAS_PASSWORD,
  E2E_TESTS_ANALYTICS_NODE_HOST,
  {
    readPreference: 'secondary',
  }
);

const COMPASS_TEST_DATA_LAKE_URL = buildConnectionString(
  'mongodb',
  E2E_TESTS_ATLAS_USERNAME,
  E2E_TESTS_ATLAS_PASSWORD,
  E2E_TESTS_DATA_LAKE_HOST,
  { tls: 'true' }
);

const COMPASS_TEST_SERVERLESS_URL = buildConnectionString(
  'mongodb+srv',
  E2E_TESTS_ATLAS_USERNAME,
  E2E_TESTS_ATLAS_PASSWORD,
  E2E_TESTS_SERVERLESS_HOST
);

const envs = createTestEnvs([
  'enterprise',
  'ldap',
  'scram',
  'sharded',
  'ssh',
  'tls',
  'kerberos',
]);

describe('connect', function () {
  describe('atlas', function () {
    it('connects to atlas replica set', async function () {
      if (!IS_CI && !COMPASS_TEST_ATLAS_URL) {
        return this.skip();
      }

      await connectAndGetAuthInfo({
        connectionString: COMPASS_TEST_ATLAS_URL,
      });
    });

    it('connects to atlas free tier', async function () {
      if (!IS_CI && !COMPASS_TEST_FREE_TIER_URL) {
        return this.skip();
      }

      await connectAndGetAuthInfo({
        connectionString: COMPASS_TEST_FREE_TIER_URL,
      });
    });

    it('connects to atlas and routes query correctly with readPreferences=secondary', async function () {
      if (!IS_CI && !COMPASS_TEST_SECONDARY_NODE_URL) {
        return this.skip();
      }

      let dataService: DataService;

      try {
        dataService = await connect({
          connectionOptions: {
            connectionString: COMPASS_TEST_SECONDARY_NODE_URL,
          },
        });

        const explainPlan = await dataService.explainFind('test.test', {}, {});

        const targetHost = explainPlan?.serverInfo?.host;
        const replSetStatus: any = await runCommand(
          dataService['_database']('admin', 'META'),
          { replSetGetStatus: 1 } as any
        );
        const targetHostStatus = replSetStatus?.members.find((member) =>
          member.name.startsWith(targetHost)
        );

        expect(targetHostStatus.stateStr).to.equal('SECONDARY');
      } finally {
        await dataService?.disconnect();
      }
    });

    it('connects to an analytics node and routes queries correctly', async function () {
      if (!IS_CI && !COMPASS_TEST_ANALYTICS_NODE_URL) {
        return this.skip();
      }

      let dataService: DataService;

      try {
        dataService = await connect({
          connectionOptions: {
            connectionString: COMPASS_TEST_ANALYTICS_NODE_URL,
          },
        });

        const explainPlan = await dataService.explainFind('test.test', {}, {});

        const replSetGetConfig: any = await runCommand(
          dataService['_database']('admin', 'META'),
          { replSetGetConfig: 1 } as any
        );

        const analtyticsNode = replSetGetConfig?.config?.members.find(
          (member) => member?.tags.nodeType === 'ANALYTICS'
        );

        // test that queries are routed to the analytics node
        expect(explainPlan?.serverInfo?.host).to.be.equal(
          analtyticsNode?.host.split(':')[0]
        );
      } finally {
        await dataService?.disconnect();
      }
    });

    it('connects to atlas with X509', async function () {
      if (
        !IS_CI &&
        !(E2E_TESTS_ATLAS_HOST || E2E_TESTS_ATLAS_X509_PEM_BASE64)
      ) {
        return this.skip();
      }

      let tempdir;
      try {
        tempdir = await fs.mkdtemp(path.join(os.tmpdir(), 'connect-tests-'));
        const certPath = path.join(tempdir, 'x509.pem');
        await fs.writeFile(
          certPath,
          process.env.E2E_TESTS_ATLAS_X509_PEM_BASE64 ?? '',
          'base64'
        );

        const url = new ConnectionStringUrl(
          `mongodb+srv://${E2E_TESTS_ATLAS_HOST || ''}/admin`
        );
        const searchParams = url.typedSearchParams<MongoClientOptions>();

        searchParams.set('authMechanism', 'MONGODB-X509');
        searchParams.set('tls', 'true');
        searchParams.set('tlsCertificateKeyFile', certPath);
        searchParams.set('authSource', '$external');

        await connectAndGetAuthInfo({
          connectionString: url.href,
        });
      } finally {
        if (tempdir) {
          await fs.rmdir(tempdir, { recursive: true });
        }
      }
    });

    it('connects to data lake', async function () {
      if (!IS_CI && !COMPASS_TEST_DATA_LAKE_URL) {
        return this.skip();
      }

      await connectAndGetAuthInfo({
        connectionString: COMPASS_TEST_DATA_LAKE_URL,
      });
    });

    it('connects to serverless', async function () {
      if (!IS_CI && !COMPASS_TEST_SERVERLESS_URL) {
        return this.skip();
      }

      await connectAndGetAuthInfo({
        connectionString: COMPASS_TEST_SERVERLESS_URL,
      });
    });
  });

  describe('docker', function () {
    before(function () {
      if (!SHOULD_RUN_DOCKER_TESTS) {
        return this.skip();
      }
    });

    it('connects to an enterprise server', async function () {
      await testConnection(envs.getConnectionOptions('enterprise'), {
        authenticatedUserRoles: [],
        authenticatedUsers: [],
      });
    });

    describe('ldap', function () {
      it('connects with ldap', async function () {
        await testConnection(envs.getConnectionOptions('ldap'), {
          authenticatedUserRoles: [
            {
              db: 'admin',
              role: 'readWriteAnyDatabase',
            },
          ],
          authenticatedUsers: [
            {
              db: '$external',
              user: 'writer@EXAMPLE.COM',
            },
          ],
        });
      });
    });

    describe('scram', function () {
      it('connects with scram (scramReadWriteAnyDatabase)', async function () {
        await testConnection(
          envs.getConnectionOptions('scramReadWriteAnyDatabase'),
          {
            authenticatedUserRoles: [
              {
                db: 'admin',
                role: 'readWriteAnyDatabase',
              },
            ],
            authenticatedUsers: [
              {
                db: 'admin',
                user: 'user1',
              },
            ],
          }
        );
      });

      it('connects with scram (scramReadWriteAnyDatabaseScramSha1)', async function () {
        await testConnection(
          envs.getConnectionOptions('scramReadWriteAnyDatabaseScramSha1'),
          {
            authenticatedUserRoles: [
              {
                db: 'admin',
                role: 'readWriteAnyDatabase',
              },
            ],
            authenticatedUsers: [
              {
                db: 'admin',
                user: 'user1',
              },
            ],
          }
        );
      });

      it('connects with scram (scramReadWriteAnyDatabaseScramSha256)', async function () {
        await testConnection(
          envs.getConnectionOptions('scramReadWriteAnyDatabaseScramSha256'),
          {
            authenticatedUserRoles: [
              {
                db: 'admin',
                role: 'readWriteAnyDatabase',
              },
            ],
            authenticatedUsers: [
              {
                db: 'admin',
                user: 'user1',
              },
            ],
          }
        );
      });

      it('connects with scram (scramOnlyScramSha1)', async function () {
        await testConnection(envs.getConnectionOptions('scramOnlyScramSha1'), {
          authenticatedUserRoles: [
            {
              db: 'admin',
              role: 'readWriteAnyDatabase',
            },
          ],
          authenticatedUsers: [
            {
              db: 'admin',
              user: 'scramSha1',
            },
          ],
        });
      });

      it('connects with scram (scramOnlyScramSha256)', async function () {
        await testConnection(
          envs.getConnectionOptions('scramOnlyScramSha256'),
          {
            authenticatedUserRoles: [
              {
                db: 'admin',
                role: 'readWriteAnyDatabase',
              },
            ],
            authenticatedUsers: [
              {
                db: 'admin',
                user: 'scramSha256',
              },
            ],
          }
        );
      });

      it('connects with scram (scramEncodedPassword)', async function () {
        await testConnection(
          envs.getConnectionOptions('scramEncodedPassword'),
          {
            authenticatedUserRoles: [
              {
                db: 'admin',
                role: 'readWriteAnyDatabase',
              },
            ],
            authenticatedUsers: [
              {
                db: 'admin',
                user: 'randomPassword',
              },
            ],
          }
        );
      });

      it('connects with scram (scramPrivilegesOnNonExistingDatabases)', async function () {
        await testConnection(
          envs.getConnectionOptions('scramPrivilegesOnNonExistingDatabases'),
          {
            authenticatedUserRoles: [
              {
                db: 'db2',
                role: 'readWrite',
              },
              {
                db: 'db1',
                role: 'read',
              },
              {
                db: 'db3',
                role: 'dbAdmin',
              },
              {
                db: 'db4',
                role: 'dbOwner',
              },
            ],
            authenticatedUsers: [
              {
                db: 'admin',
                user: 'user2',
              },
            ],
          }
        );
      });

      it('connects with scram (scramPrivilegesOnNonExistingCollections)', async function () {
        await testConnection(
          envs.getConnectionOptions('scramPrivilegesOnNonExistingCollections'),
          {
            authenticatedUserRoles: [
              {
                db: 'sandbox',
                role: 'role1',
              },
            ],
            authenticatedUsers: [
              {
                db: 'admin',
                user: 'customRole',
              },
            ],
          }
        );
      });

      it('connects with scram (scramAlternateAuthDb)', async function () {
        await testConnection(
          envs.getConnectionOptions('scramAlternateAuthDb'),
          {
            authenticatedUserRoles: [{ db: 'authDb', role: 'dbOwner' }],
            authenticatedUsers: [{ db: 'authDb', user: 'authDb' }],
          }
        );
      });
    });

    it('connects to sharded', async function () {
      await testConnection(envs.getConnectionOptions('sharded'), {
        authenticatedUserRoles: [{ db: 'admin', role: 'root' }],
        authenticatedUsers: [{ db: 'admin', user: 'root' }],
      });
    });

    it('connects to sharded with readPreferenceTags', async function () {
      const options = envs.getConnectionOptions('sharded');
      /*
      See ticket COMPASS-9111

      This test is using readPreference=nearest because this cluster has node with the tag
      ANALYTICS. readPreference=secondary would more closely mirror the
      original ticket, but this cluster also has no secondaries so that would
      fail regardless of readPreferenceTags.
      
      Ideally people would use readPreference=secondaryPreferred, but that works
      regardless so isn't a good test and if it was the case that people used
      that in the first place we'd never need this ticket.
      
      readPreference=nearest tries to find one that matches the criteria and
      since the config server doesn't know about tags the following operations
      would hang unless we remove the tags. You can confirm this manually by
      hacking maybeOverrideReadPreference in data-service.ts.
      */
      const connectionString =
        options.connectionString +
        '&readPreference=nearest&readPreferenceTags=nodeType:ANALYTICS';
      const connectionOptions = {
        ...options,
        connectionString,
      };
      await testConnection(connectionOptions, {
        authenticatedUserRoles: [{ db: 'admin', role: 'root' }],
        authenticatedUsers: [{ db: 'admin', user: 'root' }],
      });

      const dataService = await connect({
        connectionOptions,
      });

      /*
      Without us removing the read preference tags these operations would fail.

      Normal database operations like find or aggregate will still fail
      regardless because the cluster does not have a node with the ANALYTICS
      tag, but this test never executes any of those
      */
      try {
        const databases = await dataService.listDatabases();
        const databaseNames = databases
          .map((d) => d.name)
          .filter((name) => !['local'].includes(name));
        for (const databaseName of databaseNames) {
          // don't really care what's in there, just that the calls succeed
          await dataService.listCollections(databaseName);
          await dataService.databaseStats(databaseName);
        }
      } finally {
        await dataService.disconnect();
      }
    });

    describe('ssh', function () {
      it('connects with ssh (sshPassword)', async function () {
        await testConnection(envs.getConnectionOptions('sshPassword'), {
          authenticatedUserRoles: [],
          authenticatedUsers: [],
        });
      });

      it('connects with ssh (sshIdentityKey)', async function () {
        await testConnection(envs.getConnectionOptions('sshIdentityKey'), {
          authenticatedUserRoles: [],
          authenticatedUsers: [],
        });
      });

      it('connects with ssh (sshIdentityKeyWithPassphrase)', async function () {
        await testConnection(
          envs.getConnectionOptions('sshIdentityKeyWithPassphrase'),
          { authenticatedUserRoles: [], authenticatedUsers: [] }
        );
      });

      it('connects with ssh (sshReplicaSetSeedlist)', async function () {
        await testConnection(
          envs.getConnectionOptions('sshReplicaSetSeedlist'),
          { authenticatedUserRoles: [], authenticatedUsers: [] }
        );
      });

      it('connects with ssh (sshReplicaSetByReplSetName)', async function () {
        await testConnection(
          envs.getConnectionOptions('sshReplicaSetByReplSetName'),
          { authenticatedUserRoles: [], authenticatedUsers: [] }
        );
      });
    });

    describe('tls', function () {
      it('connects with tls (tlsUnvalidated)', async function () {
        await testConnection(envs.getConnectionOptions('tlsUnvalidated'), {
          authenticatedUserRoles: [],
          authenticatedUsers: [],
        });
      });

      it('connects with tls (tlsServerValidation)', async function () {
        await testConnection(envs.getConnectionOptions('tlsServerValidation'), {
          authenticatedUserRoles: [],
          authenticatedUsers: [],
        });
      });

      it('connects with tls (tlsServerValidationSsh)', async function () {
        await testConnection(
          envs.getConnectionOptions('tlsServerValidationSsh'),
          {
            authenticatedUserRoles: [],
            authenticatedUsers: [],
          }
        );
      });

      it('connects with tls (tlsServerAndClientValidation)', async function () {
        await testConnection(
          envs.getConnectionOptions('tlsServerAndClientValidation'),
          { authenticatedUserRoles: [], authenticatedUsers: [] }
        );
      });

      it('connects with tls (tlsX509)', async function () {
        await testConnection(envs.getConnectionOptions('tlsX509'), {
          authenticatedUserRoles: [
            { db: 'test', role: 'readWrite' },
            { db: 'admin', role: 'userAdminAnyDatabase' },
          ],
          authenticatedUsers: [
            {
              db: '$external',
              user: 'emailAddress=user@domain.com,CN=client1,OU=clients,O=Organisation,ST=NSW,C=AU',
            },
          ],
        });
      });

      it('connects with tls (tlsX509WithSsh)', async function () {
        await testConnection(envs.getConnectionOptions('tlsX509WithSsh'), {
          authenticatedUserRoles: [
            { db: 'test', role: 'readWrite' },
            { db: 'admin', role: 'userAdminAnyDatabase' },
          ],
          authenticatedUsers: [
            {
              db: '$external',
              user: 'emailAddress=user@domain.com,CN=client1,OU=clients,O=Organisation,ST=NSW,C=AU',
            },
          ],
        });
      });
    });

    describe('kerberos', function () {
      before(function () {
        if (process.env.COMPASS_SKIP_KERBEROS_TESTS === 'true') {
          this.skip();
        }
      });

      it('connects to kerberos', async function () {
        await testConnection(envs.getConnectionOptions('kerberos'), {
          authenticatedUserRoles: [
            {
              db: 'admin',
              role: 'readWriteAnyDatabase',
            },
          ],
          authenticatedUsers: [
            {
              db: '$external',
              user: 'mongodb.user@EXAMPLE.COM',
            },
          ],
        });
      });

      it('connects to kerberosAlternate', async function () {
        await testConnection(envs.getConnectionOptions('kerberosAlternate'), {
          authenticatedUserRoles: [
            {
              db: 'admin',
              role: 'readWriteAnyDatabase',
            },
          ],
          authenticatedUsers: [
            {
              db: '$external',
              user: 'mongodb.user@EXAMPLE.COM',
            },
          ],
        });
      });

      it('connects to kerberosCrossRealm', async function () {
        await testConnection(envs.getConnectionOptions('kerberosCrossRealm'), {
          authenticatedUserRoles: [
            {
              db: 'admin',
              role: 'readWriteAnyDatabase',
            },
          ],
          authenticatedUsers: [
            {
              db: '$external',
              user: 'mongodb.user@EXAMPLE.COM',
            },
          ],
        });
      });
    });
  });
});

async function connectAndGetAuthInfo(connectionOptions: ConnectionOptions) {
  let dataService: DataService | undefined;

  try {
    dataService = await connect({
      connectionOptions,
      logger: SHOULD_DEBUG
        ? new MongoLogWriter(new UUID().toHexString(), null, process.stderr)
        : undefined,
    });
    const connectionStatus = await runCommand(
      dataService['_database']('admin', 'META'),
      { connectionStatus: 1 }
    );

    return {
      authenticatedUserRoles:
        connectionStatus.authInfo?.authenticatedUserRoles || [],
      authenticatedUsers: connectionStatus.authInfo?.authenticatedUsers || [],
    };
  } catch (error) {
    throw new Error(
      `Failed to connect to:\n${JSON.stringify(
        redactConnectionOptions(connectionOptions),
        null,
        2
      )}\n. Caused by: ${util.inspect(error)}`
    );
  } finally {
    if (dataService) {
      await dataService.disconnect();
    }
  }
}

async function testConnection(
  connectionOptions: ConnectionOptions,
  expected: { authenticatedUsers: any[]; authenticatedUserRoles: any[] }
): Promise<void> {
  const { authenticatedUsers, authenticatedUserRoles } =
    await connectAndGetAuthInfo(connectionOptions);
  expect(authenticatedUsers).to.have.deep.members(expected.authenticatedUsers);
  expect(authenticatedUserRoles).to.have.deep.members(
    expected.authenticatedUserRoles
  );
}
