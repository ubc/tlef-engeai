# Middleware


```prerequisites

- [Agentic Engineering](/docs/logistics/agentic-engineering)
- [Database](/docs/logistics/database)
- [Docker SimpleSAML](https://github.com/ubc/docker-simple-saml)
- [Docker SimpleSAML Example App](https://github.com/ubc/passport-ubcshib-docker-simple-saml-example)
- [Passport UBCShib](https://www.npmjs.com/package/passport-ubcshib)

```

```relevant sources

- [RBAC](https://www.ibm.com/think/topics/rbac)
- [How to Use Middleware in JavaScript](https://expressjs.com/en/5x/guide/using-middleware/)

```


**Middleware** is a software layer that helps EngE-AI manage requests before they reach the main application. It checks whether a user is logged in and whether they have permission to access a feature.

This page discusses how EngE-AI uses middleware for:

1. UBC CWL authentication
2. Role-based access control (RBAC)
3. Jobs (scheduled tasks); and
4. Troubleshooting

It also explains the middleware design and its rationale. This topic is essential because middleware handles sensitive authentication data and helps protect users’ privacy.

## CWL Authentication

UBC Campus-Wide Login (CWL) is UBC’s primary authentication service and is used by most UBC applications, including EngE-AI. It allows users to authenticate through UBC’s identity provider before accessing protected application features.

EngE-AI integrates `Passport.js` to manage authentication within the application. For CWL authentication, EngE-AI uses the `passport-ubcshib` strategy, which implements UBC Shibboleth/SAML authentication. The strategy processes identity information returned by UBC and makes authenticated user information available to EngE-AI.

For more information, review `src/middleware` and [passport-ubcshib](https://www.npmjs.com/package/passport-ubcshib).

### Authentication Flow

EngE-AI uses a SAML-based authentication flow for CWL login. In local development, Docker SimpleSAML acts as the Identity Provider; in staging and production, authentication is handled by UBC CWL. The authentication is mapped as follows:

1. The user selects the CWL login option in EngE-AI.
2. EngE-AI redirects the user to the configured SAML entry point.
3. The Identity Provider authenticates the user.
4. After successful authentication, the Identity Provider sends a SAML response to EngE-AI’s callback URL.
5. Passport.js uses the ubcshib strategy to validate the response and extract the user’s authentication attributes.
6. EngE-AI maps the returned attributes, including the `PUID`, `name`, `email`, and `affiliation`, to the application’s user model.
7. The application creates or updates the user record and stores the authenticated user in the session.
8. The user is redirected to the appropriate application page according to their affiliation and permissions.
9. Subsequent requests use the session to identify the user. Authentication and RBAC middleware then determine whether the user may access the requested resource.

When the user logs out, EngE-AI terminates the local session and initiates the appropriate SAML logout flow when the CWL strategy is available.

EngE-AI includes an inactivity tracker to help protect users’ application sessions. After a period of inactivity, the application displays a warning and asks the user to continue their session. If the user does not respond, the application logs them out to reduce the risk of another person accessing their account on a shared device.

### Docker SimpleSAML

Docker SimpleSAML is a Docker container used to sandbox the complex UBC CWL authentication system and support local application development.

Review the variables in `docker-simple-saml/config/simplesamlphp/authsource.php`. The following example is listed in `userpass`:

```php
'{USERNAME}:{PASSWORD}' => array(
    'uid'                       => array( '{uid}' ),
    'cwlLoginName'              => array( '{loginName}' ),
    'cwlLoginKey'               => array( '{loginKey}' ),
    'ubcEduCwlPuid'             => array( '{PUID}' ),
    'eduPersonAffiliation'      => array( '{faculty}' ), // important
    'eduPersonScopedAffiliation' => array( '{affiliation}' ), // important
    'eduPersonPrincipalName'    => array( '{principalName}' ),
    'eduPersonEntitlement'      => array( 'urn:mace:ubc.ca:library' ),
    'employeeNumber'            => array( '4520000' ),
    'givenName'                 => array( '{firstName}' ), // important
    'sn'                        => array( '{surname}' ), // important
    'eduPersonTargetedId'       => array( 'http://localhost:8080!https://your-app!ID123456789' ),
    'isMemberOf'                => array( 'Services:Email:User' ),
),
```

The example above shows a user in the Docker SimpleSAML environment, along with the CWL username, password, and relevant attributes. `{USERNAME}` and `{PASSWORD}` are used as input for the UBC CWL username and password fields, respectively. Once the login succeeds, the authentication server sends the included attributes in JSON format.

Four essential attributes for development are:

1. affiliation (represented as `eduPersonAffiliation`);
2. PUID (represented as `ubcEduCwlPuid`);
3. given name (represented as `givenName`); and
4. surname (represented as `sn`).

In our app, student names are registered by appending the given name to the surname. To ensure that users with the same name can be distinguished, we use PUID as the unique identifier.

To add more users to your local Docker SimpleSAML environment, add a new user by following the same attribute order and providing the correct values. Then rebuild and start the container using `docker compose up -d --build`.

Once the integration between EngE-AI and Docker SimpleSAML is working correctly, you can test the authentication flow locally.

```developer-note

Important: Attribute values are returned as arrays. Some attributes contain only one value, such as `givenName`, `sn`, and `ubcEduCwlPuid`. `eduPersonAffiliation` can contain more than one value when a user is both a student and a TA. Supported affiliation values include `student`, `faculty`, and `staff`. See [ATTRIBUTES.md](https://github.com/ubc/passport-ubcshib/blob/main/ATTRIBUTES.md?plain=1#L135) for further details.

```

Review the [sample app](https://github.com/ubc/passport-ubcshib-docker-simple-saml-example) for a practical example. Contact your supervisor if you encounter any difficulties.

## RBAC

RBAC, or role-based access control, manages access and privileges based on assigned roles. RBAC is an essential part of EngE-AI because the application’s business logic heavily relies on roles; that is, actions are available based on the user’s role.

The roles use a privilege hierarchy: admin > instructor > TA > student. This means that administrators can perform all actions available to lower roles. Instructors can perform actions available to TAs and students, but not administrator-only actions. This system supports maintainability.

| Role | Function | Privileges |
| --- | --- | --- |
| Admin | Maintains EngE-AI, develops features, and resolves application bugs. | {{list:All instructor, TA, and student privileges.; Supervise every course.; Review escalation logs.; Maintain the application.}} |
| Instructor | Supervises and configures a course. | {{list:All TA and student privileges.; Supervise and escalate student flags.; Monitor student app engagement statistics.; Escalate students to TAs or vice versa.}} |
| Teaching Assistant | Assists the instructor in supervising the application for a course. | {{list:All student privileges.; Set course materials and scenario generation.; Set additional system prompts or initial assistant prompts.}} |
| Student | Uses the application as a primary learning tool. | {{list:Have conversations.; Take self-quizzes using the scenario generation feature.}} |
| Staff | Uses the application as a student; intended for individuals with a `staff` affiliation. | {{list:Same privileges as a student.}} |

RBAC is enforced through middleware. When a REST API request is sent to the server, the server checks whether the user is authorized to make the request through a callback function. For example, students cannot upload or modify course materials through protected RAG routes; these actions require authorized course staff or an administrator.

## Jobs

**Jobs** are scheduled tasks in EngE-AI and are mainly used to schedule material uploads.

Scheduling a task using Node.js timers is not preferable because a large number of concurrent timers can increase application memory usage.

The jobs are designed so that each course owns a dedicated MongoDB collection listing scheduled tasks. The job checker, triggered by an eligible user request, runs inside the middleware and consistently checks for jobs that are due to be released. As a simplification, consider this illustration:

1. An instructor schedules an activity; the activity is then recorded in the course jobs collection.
2. When an eligible authenticated request reaches the application, the job checker scans for due scheduled jobs.
3. If a job is due, EngE-AI publishes the related topic or week and removes the job after the update succeeds. If no eligible request occurs after the scheduled time, the job remains queued until the next check.

## Security, Privacy, and Troubleshooting

Middleware is crucial because it involves sensitive user data and interaction with third-party services, such as the UBC CWL server. The following practices can support secure development and effective troubleshooting:

1. Do not expose sensitive data, such as email addresses and PUIDs, to the front end unless the feature explicitly requires it.
2. For every new or updated feature, test all relevant roles, including users with multiple roles and users accessing different courses.
3. When using an AI coding agent, use Plan Mode and ask the agent to identify the RBAC requirements, intended users, course scope, and verification approach. Request clarification for any behavior that the agent cannot cover.
4. Use `curl`, browser developer tools, or similar tools to verify that protected API routes reject unauthenticated requests and requests from unauthorized roles.
5. Remove any stub values or development-only values, such as fake users, test passwords, and mock configuration, before moving to the staging environment.
6. Please consult your supervisor if you encounter any difficulties during the process.

```agent-note

When creating or updating an API endpoint, identify the required role, course scope, and authorization rule before implementation. Explain the RBAC decision in the implementation plan and include manual tests for cases that automated tests cannot cover.

```
