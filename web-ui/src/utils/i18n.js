const translations = {
  es: {
    // TopBar
    'topbar.openSidebar': 'Abrir sidebar',
    'topbar.closeSidebar': 'Cerrar sidebar',
    'topbar.settings': 'Ajustes',
    'topbar.lightMode': 'Modo claro',
    'topbar.darkMode': 'Modo oscuro',

    // Sidebar
    'sidebar.newChat': '+ Nuevo chat',
    'sidebar.searchPlaceholder': 'Buscar en chats...',
    'sidebar.noResults': 'Sin resultados',
    'sidebar.delete': 'Eliminar',
    'sidebar.today': 'Hoy',
    'sidebar.yesterday': 'Ayer',
    'sidebar.last7days': '\u00daltimos 7 d\u00edas',
    'sidebar.older': 'Anteriores',

    // ChatArea
    'chat.hello': 'Hola, soy AuditIA',
    'chat.subtitle':
      'Tu asistente IA corporativo. Escr\u00edbeme y te ayudar\u00e9 con lo que necesites.',
    'chat.sources': 'Fuentes',
    'chat.webSearch': 'B\u00fasqueda web',

    // InputArea
    'input.placeholder': 'Escribe un mensaje...',
    'input.attachImage': 'Adjuntar imagen',
    'input.attachFile': 'Adjuntar archivo',
    'input.fileTooLarge': 'El archivo excede el l\u00edmite de 10MB',
    'input.unsupportedType': 'Tipo de archivo no soportado',
    'chat.dropFile': 'Suelta tu archivo aqu\u00ed',
    'input.send': 'Enviar',
    'input.disclaimer':
      'SonIA puede cometer errores. Por favor, verifica las respuestas antes de tomar cualquier acci\u00f3n.',

    // Models
    'model.soniaLocal': 'AuditIA Local',
    'model.soniaLocalDesc': 'Modelo local con RAG y visi\u00f3n',
    'model.soniaGemini': 'AuditIA + Gemini',
    'model.soniaGeminiDesc': 'Modelo frontera (requiere autorizaci\u00f3n)',

    // Settings
    'settings.title': 'Ajustes',
    'settings.theme': 'Tema',
    'settings.theme.light': 'Claro',
    'settings.theme.dark': 'Oscuro',
    'settings.theme.system': 'Sistema',
    'settings.profile': 'Perfil',
    'settings.profile.name': 'Nombre',
    'settings.profile.namePlaceholder': 'Tu nombre',
    'settings.profile.avatar': 'Avatar',
    'settings.profile.initials': 'Iniciales',
    'settings.profile.upload': 'Subir imagen',
    'settings.profile.remove': 'Quitar imagen',
    'settings.profile.maxSize': 'M\u00e1ximo 512KB',
    'settings.language': 'Idioma',
    'settings.chatFont': 'Fuente del chat',
    'settings.chatFont.default': 'Predeterminado',
    'settings.chatFont.sans': 'Sans',
    'settings.chatFont.system': 'Sistema',
    'settings.chatFont.dyslexic': 'Adaptado para dislexia',
    'settings.notifications': 'Notificaciones',
    'settings.notifications.enable': 'Notificar cuando AuditIA responda',
    'settings.notifications.description':
      'Recibe una notificaci\u00f3n del navegador cuando se complete una respuesta.',
    'settings.notifications.denied':
      'Notificaciones bloqueadas por el navegador. Habilita en la configuraci\u00f3n del sitio.',
    'settings.memory': 'Memoria',
    'settings.memory.description': 'AuditIA recuerda estas preferencias entre conversaciones.',
    'settings.memory.empty': 'Sin memorias guardadas. SonIA aprender\u00e1 tus preferencias mientras chateas.',
    'settings.memory.delete': 'Eliminar memoria',
    'settings.memory.addTitle': 'Agregar manualmente',
    'settings.memory.keyPlaceholder': 'Ej: cliente_frecuente',
    'settings.memory.valuePlaceholder': 'Ej: Laboratorios Leti',
    'settings.memory.addButton': 'Guardar memoria',
    'settings.deleteHistory': 'Borrar historial',
    'settings.deleteHistory.button': 'Borrar todo el historial',
    'settings.deleteHistory.confirm':
      '\u00bfEst\u00e1s seguro? Esta acci\u00f3n no se puede deshacer.',
    'settings.deleteHistory.confirmButton': 'S\u00ed, borrar todo',
    'settings.deleteHistory.cancel': 'Cancelar',
  },
  en: {
    'topbar.openSidebar': 'Open sidebar',
    'topbar.closeSidebar': 'Close sidebar',
    'topbar.settings': 'Settings',
    'topbar.lightMode': 'Light mode',
    'topbar.darkMode': 'Dark mode',

    'sidebar.newChat': '+ New chat',
    'sidebar.searchPlaceholder': 'Search chats...',
    'sidebar.noResults': 'No results',
    'sidebar.delete': 'Delete',
    'sidebar.today': 'Today',
    'sidebar.yesterday': 'Yesterday',
    'sidebar.last7days': 'Last 7 days',
    'sidebar.older': 'Older',

    'chat.hello': 'Hi, I\'m SonIA',
    'chat.subtitle':
      'Your corporate AI assistant. Write me and I\'ll help you with anything you need.',
    'chat.sources': 'Sources',
    'chat.webSearch': 'Web search',

    'input.placeholder': 'Write a message...',
    'input.attachImage': 'Attach image',
    'input.attachFile': 'Attach file',
    'input.fileTooLarge': 'File exceeds 10MB limit',
    'input.unsupportedType': 'Unsupported file type',
    'chat.dropFile': 'Drop your file here',
    'input.send': 'Send',
    'input.disclaimer':
      'AuditIA may make mistakes. Always verify normative references before acting.',

    'model.soniaLocal': 'AuditIA Local',
    'model.soniaLocalDesc': 'Modelo local con corpus normativo ISA/NIIF/COSO',
    'model.soniaGemini': 'AuditIA + Gemini',
    'model.soniaGeminiDesc': 'Modelo frontera para consultas complejas',

    'settings.title': 'Settings',
    'settings.theme': 'Theme',
    'settings.theme.light': 'Light',
    'settings.theme.dark': 'Dark',
    'settings.theme.system': 'System',
    'settings.profile': 'Profile',
    'settings.profile.name': 'Name',
    'settings.profile.namePlaceholder': 'Your name',
    'settings.profile.avatar': 'Avatar',
    'settings.profile.initials': 'Initials',
    'settings.profile.upload': 'Upload image',
    'settings.profile.remove': 'Remove image',
    'settings.profile.maxSize': 'Max 512KB',
    'settings.language': 'Language',
    'settings.chatFont': 'Chat font',
    'settings.chatFont.default': 'Default',
    'settings.chatFont.sans': 'Sans',
    'settings.chatFont.system': 'System',
    'settings.chatFont.dyslexic': 'Dyslexia-friendly',
    'settings.notifications': 'Notifications',
    'settings.notifications.enable': 'Notify when AuditIA responds',
    'settings.notifications.description':
      'Get a browser notification when a response is complete.',
    'settings.notifications.denied':
      'Notifications blocked by the browser. Enable in site settings.',
    'settings.memory': 'Memory',
    'settings.memory.description': 'AuditIA remembers these preferences across conversations.',
    'settings.memory.empty': 'No saved memories. AuditIA will learn your preferences as you chat.',
    'settings.memory.delete': 'Delete memory',
    'settings.memory.addTitle': 'Add manually',
    'settings.memory.keyPlaceholder': 'E.g.: frequent_client',
    'settings.memory.valuePlaceholder': 'E.g.: Laboratorios Leti',
    'settings.memory.addButton': 'Save memory',
    'settings.deleteHistory': 'Delete history',
    'settings.deleteHistory.button': 'Delete all history',
    'settings.deleteHistory.confirm':
      'Are you sure? This action cannot be undone.',
    'settings.deleteHistory.confirmButton': 'Yes, delete everything',
    'settings.deleteHistory.cancel': 'Cancel',
  },
};

let currentLocale = 'es';

export function setLocale(locale) {
  currentLocale = locale;
}

export function getLocale() {
  return currentLocale;
}

export function t(key) {
  return translations[currentLocale]?.[key] || translations['es']?.[key] || key;
}
