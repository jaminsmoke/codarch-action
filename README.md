> Repositorio generado desde [`jaminsmoke/codarch`](https://github.com/jaminsmoke/codarch).
> No editar aquí: los cambios se hacen en `apps/github-action` y se sincronizan con
> `npm run sync:action`.

# CodArch GitHub Action

Repositorio público: [`jaminsmoke/codarch-action`](https://github.com/jaminsmoke/codarch-action).

Analiza el commit base y el head de un pull request, escribe un `report.json` determinista, publica el
mapa como artefacto y actualiza un comentario en el PR.

La acción instala el CLI publicado en npm (`codarch@0.3.1-alpha.1` por defecto), así que no necesita el
código de CodArch en el workspace ni ejecuta `npm ci` sobre el proyecto analizado. La decisión está en
[ADR 0012](https://github.com/jaminsmoke/codarch/blob/main/docs/adr/0011-0020/0012-github-action.md) y
[ADR 0014](https://github.com/jaminsmoke/codarch/blob/main/docs/adr/0011-0020/0014-distribucion-cli-npm.md).

> [!NOTE]
> El producto está en **alpha** ✓ ([ADR 0032](https://github.com/jaminsmoke/codarch/blob/main/docs/adr/0031-0040/0032-las-versiones-y-las-actualizaciones.md)):
> las alphas se publican en npm con la etiqueta `next` ✓, así que la acción instala por defecto la
> alpha actual ✓. Para instalar la última versión normal:
>
> ```yaml
> - uses: jaminsmoke/codarch-action@v1
>   with:
>     version: 0.2.0
> ```

## Uso

```yaml
name: CodArch

on:
  pull_request:

permissions:
  contents: read
  pull-requests: write

jobs:
  codarch:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
        with:
          fetch-depth: 0

      - uses: jaminsmoke/codarch-action@v1
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          fail-on: none # aviso; usa violations, cycles, hotspots o any para bloquear
          config: .codarch.yml
```

`fetch-depth: 0` es necesario para que la acción pueda calcular el merge-base y crear un worktree
del commit base. Si el PR viene de un fork, el `GITHUB_TOKEN` suele ser de solo lectura; en ese caso
el análisis y el artefacto funcionan, pero el comentario se omite con un warning.

## Entradas

| Entrada | Por defecto | Descripción |
|---|---|---|
| `github-token` | `""` | Token para comentar. En pull requests del mismo repo, `secrets.GITHUB_TOKEN`. |
| `base-ref` | `GITHUB_BASE_REF` | Rama base si no se pasa `base-sha`. |
| `base-sha` | `""` | Commit base explícito; evita calcular el merge-base. |
| `fail-on` | `none` | `none`, `cycles`, `violations`, `hotspots` o `any`. |
| `config` | `.codarch.yml` | Política y alcance relativos al root; vacío o `none` los desactiva. |
| `comment` | `true` | Publica o actualiza el comentario del PR. |
| `artifact-name` | `codarch` | Nombre del artefacto. |
| `node-version` | `22` | Versión de Node. |
| `version` | `0.2.0` | Versión exacta de `codarch` que se instala desde npm. |
| `working-directory` | `.` | Directorio del proyecto. |
| `title` | `CodArch` | Título del mapa. |
| `top` | `10` | Hotspots incluidos en el reporte. |

El `config` también fija el alcance: base y head leen su propio `ignore` antes de analizar, y `none`
desactiva tanto las reglas del diff como la lectura del archivo en los análisis. Si el alcance cambia
en el PR, el diff muestra los ficheros que entran o salen.

## Salidas

| Salida | Contenido |
|---|---|
| `report` | Ruta absoluta a `report.json`. |
| `map` | Ruta absoluta a `map.html` del head. |
| `status` | `0` sin bloqueo, `2` política incumplida, `1` error. |

## Artefacto

El artefacto contiene:

```
base/snapshot.cc.json
base/map.html
head/snapshot.cc.json
head/map.html
map.html
report.json
```

El comentario se actualiza en lugar de duplicarse: busca el marcador `<!-- codarch-report -->` y
edita ese comentario. Si no existe, crea uno nuevo.

## Política

El análisis siempre termina y publica el comentario y el artefacto. El resultado del check depende
de `fail-on`:

- `none`: nunca falla por hallazgos; es el modo aviso.
- `cycles`: falla si hay ciclos nuevos.
- `violations`: falla si hay violaciones introducidas con severidad `error`.
- `hotspots`: falla si hay hotspots nuevos.
- `any`: cualquiera de los tres.

La severidad se decide en `.codarch.yml`; ver
[`docs/rules.md`](https://github.com/jaminsmoke/codarch/blob/main/docs/rules.md). La acción
distingue el código `2` (gate) del `1` (error de lectura o configuración) para que el workflow pueda
diagnosticar sin ambigüedad.

## Límites

- No analiza PRs de forks con permiso de escritura si el token es read-only.
- El checkout del head es el workspace actual; no hace un checkout separado del head.
- Instalar `codarch` desde npm añade unos segundos a cada ejecución; se puede cachear el prefijo o usar
  una imagen con el CLI preinstalado.
- La acción usa `git worktree`, así que el runner necesita un checkout con historial suficiente.
