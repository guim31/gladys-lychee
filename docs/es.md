# Lychee

Su galería de fotos [Lychee](https://lycheeorg.dev) en Gladys, a través de su
red local: el número de fotos, álbumes y usuarios, la última foto añadida, un
dispositivo por álbum que quiera seguir, escenas que reaccionan cuando llegan
fotos nuevas o un álbum crece, una acción de escena que lee las últimas fotos y
un widget del panel con las últimas fotos.

La integración se ha probado con una galería Lychee real (la imagen Docker
`lycheeorg/lychee`, Lychee 7.12, con MariaDB), todavía no en una instalación
real de Gladys: sus comentarios son bienvenidos en el
[foro de Gladys](https://community.gladysassistant.com) o en las
[issues](https://github.com/guim31/gladys-lychee/issues).

## Qué necesita

- Gladys Assistant 5.1.0 o posterior.
- Una galería **Lychee** (versión 6 o posterior, con la API `/api/v2`)
  accesible desde Gladys (misma red).
- Una cuenta **administradora**, o **autorizada a subir fotos**: Lychee solo
  muestra el álbum «Reciente», donde la integración encuentra las fotos nuevas,
  a esas cuentas. Un administrador da además el número de usuarios y los
  totales exactos de la galería.
- Lo mejor: un **token de API** de esa cuenta: en Lychee, abra su **perfil**,
  luego **token de API**, cree uno y cópielo (Lychee solo lo muestra una vez).
- Si no, el usuario y la contraseña de la cuenta.

## Configuración

1. Instale la integración desde el catálogo de Gladys.
2. En **Configuración**, introduzca la **Dirección de la galería** con su
   puerto y su carpeta (por ejemplo `http://192.168.1.20:8000`; la imagen
   Docker oficial escucha en el puerto 8000, y también vale una página de la
   galería copiada del navegador) y pegue el **token de API** en el campo de la
   contraseña, sin usuario. Con una cuenta, introduzca su usuario y su
   contraseña.
3. Si quiere, indique los **Álbumes que seguir**: nombres o identificadores
   separados por comas (`Vacaciones`); un subálbum por su ruta
   (`Vacaciones / Playa`). El identificador son los 24 caracteres al final de
   la dirección del álbum (`/gallery/<identificador>`); úselo para un nombre con
   una coma.
4. Elija la **Actualización** (5 minutos por defecto) y el **Idioma de los
   nombres**, y guarde. **Probar la conexión** lee la galería enseguida e indica
   los álbumes no encontrados.
5. En **Descubrimiento**, añada el dispositivo **Lychee** y los dispositivos de
   álbum que quiera.

## Dispositivos

El dispositivo **Lychee** muestra toda la galería (solo lectura):

| Función             | Qué muestra                                                             |
| ------------------- | ----------------------------------------------------------------------- |
| Fotos               | Fotos de la galería (administrador) o de los álbumes que usted ve       |
| Álbumes             | Álbumes de la galería (administrador) o los que usted ve                |
| Usuarios            | Usuarios de la galería (solo cuenta administradora)                     |
| Última foto añadida | Su nombre, su álbum si se conoce y el día: `Atardecer · Playa · 25 oct` |

Cada álbum seguido da un dispositivo **Lychee – ruta del álbum**:

| Función        | Qué muestra                                               |
| -------------- | --------------------------------------------------------- |
| Fotos          | Fotos del propio álbum, tal como las cuenta Lychee        |
| Última adición | Día y hora de la última foto subida: `25 oct 2026, 17:07` |

La integración lee la galería por sí misma (unas pocas peticiones por lectura,
una más por álbum con subálbumes y por álbum seguido): no hay nada que ajustar
en Gladys. El indicador de conexión de los dispositivos se pone en rojo cuando
la galería deja de responder.

## Panel

El widget **Últimas fotos** muestra los contadores (fotos, álbumes, usuarios) y
las últimas fotos subidas: nombre, álbum si se conoce, día; al pulsar se ve la
hora de subida y el día en que se tomó. Con el ajuste **Álbum seguido**,
muestra uno de sus álbumes seguidos en lugar de toda la galería.

Las miniaturas están **desactivadas por defecto**: con el ajuste **Mostrar
miniaturas**, aparece la pequeña miniatura cuadrada de cada foto, y sus fotos
aparecen entonces en cualquier pantalla que muestre este panel (una tableta
compartida, un panel público, Gladys Plus). El navegador nunca carga Lychee
directamente: Gladys se lo pide a la integración, que solo sirve las fotos del
widget.

## Escenas

### Disparadores

- **Fotos nuevas añadidas**: se subieron fotos a la galería, sea cual sea el
  medio (subida web, importación, sincronización), vistas en la lectura
  siguiente. Variables: número de fotos añadidas, nombre, álbum (vacío para una
  foto sin clasificar), fecha de adición y página de la última.
- **Fotos añadidas a un álbum**: un álbum contiene más fotos que en la lectura
  anterior (sin sus subálbumes; un álbum nuevo cuenta desde cero). Filtro: el
  nombre del álbum, exactamente como en Lychee, sin sus álbumes padre.
  Variables: nombre, ruta e identificador del álbum, fotos añadidas, fotos en el
  álbum, página del álbum.

### Acciones

- **Leer las últimas fotos**: lee enseguida las últimas fotos subidas, a toda la
  galería (el álbum «Reciente» de Lychee) o a un álbum (nombre, ruta o
  identificador). Salidas para las acciones siguientes de la escena: fotos
  añadidas en 24 horas, fotos en total, nombre, álbum, fecha de adición y
  página de la última. No cambia nada en Lychee.

### Ideas de escenas

- Con **Fotos nuevas añadidas**, enviar un mensaje a la familia:
  «{{count}} fotos nuevas, la última: {{name}} en {{album}}».
- Cada noche a las 21 h, **Leer las últimas fotos** del álbum «Familia» y, si
  **Fotos añadidas en 24 horas** es mayor que 0, mostrar un mensaje en la
  tableta del salón.
- Con **Fotos añadidas a un álbum** «Vacaciones 2026», encender el pasillo en
  azul.

## Solución de problemas

- **«token de API, usuario o contraseña rechazados»**: el token se regeneró o
  no se pegó entero; con una cuenta, compruebe el usuario y la contraseña.
- **«esta cuenta no puede leer «Reciente»»**: dé a la cuenta el derecho de
  subir fotos en la gestión de usuarios de Lychee, o use un administrador. El
  álbum «Reciente» no debe estar desactivado en los ajustes de Lychee.
- **«demasiados intentos de conexión»**: Lychee acepta 10 conexiones por hora.
  Compruebe la contraseña, o prefiera un token de API, que no necesita
  conexión.
- **«la galería no responde»**: compruebe la dirección y el puerto desde el
  equipo de Gladys.
- **«no hay ninguna galería Lychee en esta dirección»**: la dirección lleva a
  otra página (página de inicio de sesión de un proxy inverso, otra
  aplicación): introduzca la dirección de la propia galería.
- **«certificado rechazado»**: un certificado autofirmado; use la dirección
  `http://` de su red.
- **Las fotos nuevas no aparecen**: el álbum «Reciente» solo contiene las fotos
  de los últimos días (ajuste «recent_age» de Lychee, 1 día por defecto); las
  fotos importadas con una fecha de subida antigua no se anuncian.
- **El número de usuarios sigue vacío**: la cuenta no es administradora.
- `LOG_LEVEL=debug` en los registros de la integración muestra cada lectura.

## Límites

- Las fotos nuevas se ven en la lectura siguiente (5 minutos por defecto), y
  solo las que la cuenta puede ver.
- El número de un álbum no incluye sus subálbumes: Lychee cuenta cada álbum por
  separado. El árbol se lee hasta 300 álbumes.
- La integración solo lee: nunca modifica, sube ni elimina nada en Lychee.
- Ninguna foto sale de su red a través de la integración, salvo si activa las
  miniaturas del widget.
- Las fechas se muestran en la zona horaria de Gladys.
- Sin relación con el proyecto Lychee.
