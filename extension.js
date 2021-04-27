// create atom project opener
// view log: journalctl /usr/bin/gnome-session -f -o cat

const Meta = imports.gi.Meta;
const St = imports.gi.St;
const Lang = imports.lang;
const Main = imports.ui.main;
const Shell = imports.gi.Shell;
const Gio = imports.gi.Gio;
const Tweener = imports.tweener.tweener;
const Params = imports.misc.params;
const Me = imports.misc.extensionUtils.getCurrentExtension();
const Soup = imports.gi.Soup;

const Gettext = imports.gettext;

Gettext.textdomain("ecosia@yaya.cout");

const _ = Gettext.gettext;

let ecosiaSearchProvider = null;

const searchUrl = "https://www.ecosia.org/search?q=";
const suggestionsUrl = "https://ac.ecosia.org/?q=";
const ecosiaLocale = _("fr");
const _httpSession = new Soup.Session();

let button;
let baseGIcon;
let hoverGIcon;
let buttonIcon;

let debug = false;

function logDebug() {
    if (debug) {
        log.apply(
            this,
            Array.from(arguments)
        )
    }
}

function makeResult(name, description, icon, id) {
    return {
        'id': id,
        'name': name,
        'description': description,
        'icon': icon
    }
}

function makeLaunchContext(params) {
    params = Params.parse(params, {
        workspace: -1,
        timestamp: global.display.get_current_time_roundtrip()
    });

    const launchContext = global.create_app_launch_context(
        params.timestamp,
        params.workspace
    );

    return launchContext;
}

const EcosiaSearchProvider = new Lang.Class({
    Name: 'EcosiaSearchProvider',

    _init: function(title, categoryType) {
        this._categoryType = categoryType;
        this._title = title;
        this.id = 'ecosia-search-' + title;
        this.appInfo = {
            should_show: function() {
                return this
            },
            get_name: function() {
                return _("Recherche Écosia");
            },
            get_icon: function() {
                return Gio.icon_new_for_string(
                    Me.path + "/icons/ecosia_logo.svg"
                );
            },
            get_id: function() {
                return this.id;
            }
        };
        this.ecosiaResults = new Map();
    },

    _getResultSet: function(terms) {
        logDebug("getResultSet");
        const resultIds = Array.from(this.ecosiaResults.keys())


        logDebug("found " + resultIds.length + " results");
        return resultIds;
    },

    getResultMetas: function(resultIds, callback) {
        logDebug("result metas for name: " + resultIds.join(" "));
        const metas = resultIds.map(id => this.getResultMeta(id));
        logDebug("metas: " + metas.join(" "));
        callback(metas);
    },

    getResultMeta: function(resultId) {
        const result = this.ecosiaResults.get(resultId);
        const name = result.name;
        const description = result.description;
        logDebug("result meta for name: " + result.name);
        logDebug("result meta: ", resultId);
        return {
            'id': resultId,
            'name': name,
            'description': description,
            'createIcon': function(size) {}
        }
    },

    processTerms: function(terms, callback, cancellable) {
        this.ecosiaResults.clear();
        const joined = terms.join(" ");
        this.ecosiaResults.set(
            searchUrl + encodeURIComponent(joined) + "#",
            makeResult(_("Rechercher \"{terms}\" avec Écosia").replace("{terms}", joined),
                " ",
                function() {},
                searchUrl + encodeURIComponent(joined) + "#")
        );
        logDebug("ProcessTerms: " + joined);
        logDebug("Search with: " + joined);
        this.getSuggestions(terms, callback)
    },

    getSuggestions: function(terms, callback) {
        const joined = terms.join(" ");
        let suggestions = {};
        const request = Soup.form_request_new_from_hash(
            'GET',
            suggestionsUrl, { 'q': joined, 'lang': ecosiaLocale }
        );
        logDebug("getSuggestions: ")

        _httpSession.queue_message(request, Lang.bind(this,
            function(_httpSession, response) {
                try {
                    const json = JSON.parse(response.response_body.data);
                    const jsonItems = json.suggestions;
                    logDebug("bodydata", response.response_body.data);
                    const parsedItems = jsonItems
                        .filter(suggestion => suggestion != joined)
                        .map(suggestion => {
                            if (suggestion.startsWith("&")) {
                                return {
                                    type: "special",
                                    name: suggestion,
                                    description: suggestion.site_name,
                                    url: searchUrl + encodeURIComponent(suggestion)
                                };
                            } else {
                                return {
                                    type: "suggestion",
                                    name: suggestion,
                                    url: searchUrl + encodeURIComponent(suggestion)
                                };
                            }
                        });
                    suggestions = parsedItems;
                } catch (e) {
                    logDebug("No internet or request failed, cannot get suggestions");
                    suggestions = [{
                        type: "special",
                        name: _("Erreur"),
                        description: _("Veuillez vérifier votre connexion Internet ou réessayer plus tard (" + e + ")"),
                        url: " "
                    }];
                    logDebug("Array: " + JSON.stringify(suggestions));
                }
                this.displaySuggestions(suggestions, callback, terms);

            }));



        /********************TODO: Get results from Écosia********************/

    },

    displaySuggestions: function(suggestions, callback, terms) {
        suggestions.forEach(suggestion => {
            if (suggestion.type == "suggestion") {
                this.ecosiaResults.set(
                    suggestion.url,
                    makeResult(
                        " ",
                        suggestion.name,
                        function() {},
                        suggestion.url
                    )
                );
            }
            if (suggestion.type == "special") {
                this.ecosiaResults.set(
                    suggestion.url,
                    makeResult(
                        suggestion.name,
                        suggestion.description,
                        function() {},
                        suggestion.url
                    )
                );
            }
        });
        callback(this._getResultSet(terms));
    },

    activateResult: function(resultId, terms) {
        const result = this.ecosiaResults[resultId];
        logDebug("activateResult: " + resultId);
        const url = resultId;
        logDebug("url: " + url)
        Gio.app_info_launch_default_for_uri(
            url,
            makeLaunchContext({})
        );
    },

    launchSearch: function(result) {
        logDebug("launchSearch: " + result.name);
        Gio.app_info_launch_default_for_uri(
            "https://www.ecosia.org/",
            makeLaunchContext({})
        );
    },

    getInitialResultSet: function(terms, callback, cancellable) {
        logDebug("SuggestionId: " + this.suggestionId);
        logDebug("getInitialResultSet: " + terms.join(" "));
        this.processTerms(terms, callback, cancellable);
    },

    filterResults: function(results, maxResults) {
        logDebug("filterResults", results, maxResults);
        return results.slice(0, maxResults);
        //return results;
    },

    getSubsearchResultSet: function(previousResults, terms, callback, cancellable) {
        logDebug("getSubSearchResultSet: " + terms.join(" "));
        this.processTerms(terms, callback, cancellable);
    },


});

function _openEcosia() {
    logDebug("Lauched Écosia from button");
    Gio.app_info_launch_default_for_uri(
        "https://www.ecosia.org/",
        makeLaunchContext({})
    );
}

function init(extensionMeta) {
    logDebug("Écosia search provider started");
}

function enable() {
    button = new St.Bin({
        style_class: 'panel-button',
        reactive: true,
        can_focus: true,
        x_expand: true,
        y_expand: false,
        track_hover: true
    });
    baseGIcon = Gio.icon_new_for_string(
        Me.path + "/icons/system_status_icon.png"
    );
    hoverGIcon = Gio.icon_new_for_string(
        Me.path + "/icons/ecosia_logo.svg"
    );
    buttonIcon = new St.Icon({
        'gicon': Gio.icon_new_for_string(
            Me.path + "/icons/system_status_icon.png"
        ),
        'style_class': 'system-status-icon'
    });

    button.set_child(buttonIcon);
    button.connect(
        'button-press-event',
        Lang.bind(this, _openEcosia)
    );
    button.connect(
        'enter-event',
        function() {
            _SetButtonIcon('hover');
        }
    );
    button.connect(
        'leave-event',
        function() {
            _SetButtonIcon('base');
        }
    );
    logDebug("Enable Écosia search provider");
    if (!ecosiaSearchProvider) {
        logDebug("Enable Écosia search provider");
        ecosiaSearchProvider = new EcosiaSearchProvider();
        Main.overview.viewSelector._searchResults._registerProvider(
            ecosiaSearchProvider
        );
    }
    Main.panel._rightBox.insert_child_at_index(button, 0);
}

function disable() {
    if (ecosiaSearchProvider) {
        logDebug("Disable Écosia search provider");
        Main.overview.viewSelector._searchResults._unregisterProvider(
            ecosiaSearchProvider
        );
        ecosiaSearchProvider = null;
    }
    Main.panel._rightBox.remove_child(button);
}

function _SetButtonIcon(mode) {
    if (mode === 'hover') {
        buttonIcon.set_gicon(hoverGIcon);
    } else {
        buttonIcon.set_gicon(baseGIcon);
    }
}