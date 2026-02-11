To install dependencies:

```sh
bun install
```

To run:

```sh
bun run dev
```

open http://localhost:4400

## API documentation

Base URL (local): `http://localhost:4400`

### Authentication

All `/projects` routes require a Bearer token.

Header:

```
Authorization: Bearer <token>
```

### Auth endpoints

#### POST /auth/register

Create a new user and return a JWT token.

Request body:

```json
{
	"email": "user@example.com",
	"password": "secret123",
	"name": "Optional Name"
}
```

Responses:

- `201` with `{ token, user }`
- `400` if validation fails
- `409` if email already registered

#### POST /auth/login

Authenticate an existing user and return a JWT token.

Request body:

```json
{
	"email": "user@example.com",
	"password": "secret123"
}
```

Responses:

- `200` with `{ token, user }`
- `400` if validation fails
- `401` if credentials are invalid

### Project endpoints (auth required)

#### GET /projects

List projects owned by the authenticated user.

Response:

```json
{
	"projects": [
		{
			"id": "...",
			"name": "...",
			"description": "...",
			"ownerId": "...",
			"createdAt": "...",
			"updatedAt": "...",
			"_count": { "versions": 3 }
		}
	]
}
```

#### POST /projects

Create a project.

Request body:

```json
{
	"name": "My Project",
	"description": "Optional description"
}
```

Responses:

- `201` with `{ project }`
- `400` if validation fails

#### GET /projects/:id

Fetch a project and its latest versions.

Responses:

- `200` with `{ project }` (includes up to 10 versions)
- `404` if project not found

### Version endpoints (auth required)

#### POST /projects/:id/versions

Create a new version for a project. Starts in `uploading` status.

Responses:

- `201` with `{ version }`
- `404` if project not found

#### PUT /projects/:id/versions/:vId/complete

Mark a version as complete.

Responses:

- `200` with `{ version }`
- `404` if project not found

#### GET /projects/:id/versions/:vId

Fetch a version with its screens. Screen `imageUrl` values are rewritten
to the server proxy endpoint.

Responses:

- `200` with `{ version, project }`
- `404` if project or version not found

#### GET /projects/:id/versions/:vId/uploaded-screens

List `sketchId` values already uploaded for the version.

Response:

```json
{
	"sketchIds": ["abc", "def"]
}
```

#### GET /projects/:id/versions/:vId/tokens

Fetch stored design tokens for the version.

Responses:

- `200` with `{ tokens, project }`
- `404` if project or version not found

#### POST /projects/:id/versions/:vId/tokens

Store design tokens for the version.

Request body:

```json
{
	"colors": [ ... ],
	"textStyles": [ ... ],
	"layerStyles": [ ... ]
}
```

Responses:

- `200` with `{ ok: true }`
- `400` if validation fails
- `404` if project not found

### Screen endpoints (auth required)

#### POST /projects/:id/versions/:vId/screens

Upload or update a screen by `sketchId`. If a screen with the same
`sketchId` exists in this version, it is updated.

Request body:

```json
{
	"name": "Screen Name",
	"sketchId": "sketch-layer-id",
	"pageName": "Page 1",
	"width": 1440,
	"height": 900,
	"imageBase64": "data:image/png;base64,...",
	"layers": { ... },
	"flows": { ... },
	"displayOrder": 0
}
```

Responses:

- `201` with `{ screen: { id, name } }`
- `400` if validation fails or version already complete
- `404` if project or version not found

#### GET /projects/:id/versions/:vId/screens/:sId

Fetch a single screen with siblings for navigation. Screen `imageUrl`
is rewritten to the server proxy endpoint.

Responses:

- `200` with `{ screen, siblings, project }`
- `404` if project or screen not found

### Public image proxy

#### GET /screens/:screenId/image

Public (no auth required) image proxy for a screen ID. Useful for
serving images without exposing storage credentials.

Responses:

- `200` with image bytes
- `404` if screen or image not found
- `500` on storage errors
