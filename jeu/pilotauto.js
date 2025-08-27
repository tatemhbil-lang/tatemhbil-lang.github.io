class MetroAutoPilot {
    constructor(simulator) {
        this.simulator = simulator;
        this.isActive = false;
        this.state = 'idle'; // 'idle', 'accelerating', 'cruising', 'braking', 'station_stop', 'doors_open', 'doors_closing', 'waiting_departure'
        this.stationTimer = 0;
        
        // Paramètres de vitesse
        this.MIN_CRUISE_SPEED = 45;
        this.MAX_CRUISE_SPEED = 80; // Mise à jour pour correspondre au nouveau référentiel
        this.targetSpeed = this.MAX_CRUISE_SPEED;
        
        // Paramètres d'arrêt
        this.PERFECT_STOP_DISTANCE = 0.5; // Distance parfaite pour l'arrêt (0.5m)
        this.STOP_TOLERANCE_BEFORE = 2;   // Tolérance avant le point cible (2m)
        this.STOP_TOLERANCE_AFTER = 2;    // Tolérance après le point cible (2m)
        
        // --- CORRECTION BOUCLE PORTES ---
        this._doorsWereClosed = false; // Drapeau pour gérer la transition après fermeture des portes
        this._stationStopHandled = false; // Drapeau pour éviter les actions répétées à l'arrêt en station
        // --- FIN CORRECTION BOUCLE PORTES ---
        
        // Paramètres de freinage - PLUS DE MODIFICATION POSSIBLE
        // Le train freine toujours au niveau maximum (-5) pour s'arrêter à la distance calculée
        // this.BRAKING_DISTANCE_ADJUSTMENT = 0; // Propriété supprimée
        
        // Paramètres de timing
        this.DOOR_OPEN_DELAY = 1000;   // 1s après l'arrêt
        this.DOOR_OPEN_TIME = 5000;    // 5s ouvertes
        this.DOOR_CLOSE_DELAY = 2000;  // 2s avant de repartir
        
        // Distances critiques pour les changements d'état
        this.DISTANCE_FOR_MAX_SPEED = 350;    // Au-delà de 350m, vitesse max
        this.DISTANCE_FOR_HIGH_SPEED = 250;   // Entre 250-350m, vitesse élevée  
        this.DISTANCE_FOR_MED_SPEED = 180;    // Entre 180-250m, vitesse moyenne
        this.DISTANCE_FOR_LOW_SPEED = 120;     // En dessous de 180m, vitesse réduite
        
        console.log('AutoPilot v2 initialisé - Freinage basé sur 80km/h = 250m');
        console.log('Ajustement manuel désactivé - Freinage toujours au niveau maximum (-5)');
    }

    /**
     * Méthode pour définir l'ajustement - NE FAIT PLUS RIEN
     * @param {number} adjustment Ajustement en mètres (+ ou -)
     */
    setBrakingAdjustment(adjustment) {
        console.log(`Ajustement de freinage désactivé. Le train freine toujours à 250m à 80km/h.`);
        // Ne fait rien - ajustement désactivé
    }

    activate() {
        if (this.isActive) return;
        this.isActive = true;
        
        // --- CORRECTION BOUCLE PORTES ---
        // Réinitialiser les drapeaux lors de l'activation
        this._doorsWereClosed = false;
        this._stationStopHandled = false;
        // --- FIN CORRECTION BOUCLE PORTES ---
        
        console.log('AutoPilot activé');
        
        // Déterminer l'état initial
        if (this.simulator.speed === 0) {
            if (this.simulator.areDoorsOpen) {
                this.state = 'doors_open';
                this.stationTimer = Date.now();
                this.simulator.updateSystemStatus('AUTO: Portes ouvertes');
            } else {
                this.startJourney();
            }
        } else {
            // Train en mouvement, déterminer l'action appropriée
            const distance = this.getDistanceToStation();
            if (distance !== null && distance <= this.calculateBrakingDistance()) {
                this.state = 'braking';
                this.simulator.setAcceleration(-5); // Toujours freinage maximal
                this.simulator.updateSystemStatus('AUTO: Freinage');
            } else {
                this.continueJourney();
            }
        }
    }

    deactivate() {
        if (!this.isActive) return;
        this.isActive = false;
        this.state = 'idle';
        this.stationTimer = 0;
        
        // --- CORRECTION BOUCLE PORTES ---
        // Réinitialiser les drapeaux lors de la désactivation
        this._doorsWereClosed = false;
        this._stationStopHandled = false;
        // --- FIN CORRECTION BOUCLE PORTES ---
        
        // FU direct quand on désactive le PA manuellement
        this.simulator.emergencyStop();
        console.log('AutoPilot désactivé - FU activé');
    }

    update() {
        if (!this.isActive) return;

        const distance = this.getDistanceToStation();
        const speed = this.simulator.speed;

        switch (this.state) {
            case 'idle':
                this.handleIdleState();
                break;
            case 'accelerating':
                this.handleAcceleratingState(distance, speed);
                break;
            case 'cruising':
                this.handleCruisingState(distance, speed);
                break;
            case 'braking':
                this.handleBrakingState(distance, speed);
                break;
            case 'station_stop':
                this.handleStationStopState(); // Ne prend plus distance/speed
                break;
            case 'doors_open':
                this.handleDoorsOpenState();
                break;
            case 'doors_closing':
                this.handleDoorsClosingState();
                break;
            case 'waiting_departure':
                this.handleWaitingDepartureState();
                break;
        }
    }

    /**
     * Récupère la distance au prochain quai depuis l'affichage
     * @returns {number|null} Distance en mètres ou null
     */
    getDistanceToStation() {
        const distanceText = this.simulator.distanceDisplay.textContent;
        if (!distanceText || distanceText === '--- m') {
            return null;
        }
        
        const distance = parseFloat(distanceText.replace(' m', ''));
        return isNaN(distance) ? null : distance;
    }

    /**
     * Calcule la distance de freinage nécessaire selon la vitesse actuelle
     * Basé sur les données réelles : 80 km/h = 250m de freinage
     * @returns {number} Distance de freinage en mètres
     */
    calculateBrakingDistance() {
        const speed = this.simulator.speed;
        if (speed <= 0) return 0;
        
        // Calcul basé sur la relation empirique : 80 km/h → 250m
        // Formule : distance = (vitesse / 80)^2 * 250
        // Le freinage suit une courbe quadratique (distance proportionnelle au carré de la vitesse)
        const baseDistance = 250; // Distance pour 80 km/h - MODIFIÉ
        const baseSpeed = 80;
        
        // Relation quadratique pour le freinage
        let brakingDistance = baseDistance * Math.pow(speed / baseSpeed, 2);
        
        // PLUS D'AJUSTEMENT MANUEL
        // brakingDistance += this.BRAKING_DISTANCE_ADJUSTMENT;
        
        console.log(`Vitesse: ${speed.toFixed(1)} km/h → Distance freinage: ${brakingDistance.toFixed(1)}m`);
        return Math.max(0, brakingDistance); // Jamais négatif
    }

    /**
     * Détermine la vitesse cible selon la distance au prochain quai
     * @param {number} distance Distance en mètres
     */
    updateTargetSpeed(distance) {
        if (distance === null) {
            this.targetSpeed = this.MAX_CRUISE_SPEED;
            return;
        }

        if (distance > this.DISTANCE_FOR_MAX_SPEED) {
            this.targetSpeed = this.MAX_CRUISE_SPEED; // 80 km/h
        } else if (distance > this.DISTANCE_FOR_HIGH_SPEED) {
            this.targetSpeed = 70; // Vitesse élevée
        } else if (distance > this.DISTANCE_FOR_MED_SPEED) {
            this.targetSpeed = 60; // Vitesse moyenne
        } else if (distance > this.DISTANCE_FOR_LOW_SPEED) {
            this.targetSpeed = this.MIN_CRUISE_SPEED; // 45 km/h
        } else {
            this.targetSpeed = 35; // Vitesse très réduite proche de la station
        }

        console.log(`Distance: ${distance}m → Vitesse cible: ${this.targetSpeed} km/h`);
    }

    startJourney() {
        console.log('Début du voyage');
        this.state = 'accelerating';
        this.simulator.setAcceleration(5); // Accélération maximale
        this.simulator.updateSystemStatus('AUTO: Accélération');
        
        const distance = this.getDistanceToStation();
        this.updateTargetSpeed(distance);
    }

    continueJourney() {
        const distance = this.getDistanceToStation();
        this.updateTargetSpeed(distance);
        
        if (this.simulator.speed >= this.targetSpeed) {
            this.state = 'cruising';
            this.simulator.setAcceleration(0);
            this.simulator.updateSystemStatus('AUTO: Vitesse de croisière');
        } else {
            this.state = 'accelerating';
            this.simulator.setAcceleration(5);
            this.simulator.updateSystemStatus('AUTO: Accélération');
        }
    }

    handleIdleState() {
        if (this.simulator.speed === 0 && !this.simulator.areDoorsOpen && !this.simulator.isFuActive) {
            this.startJourney();
        }
    }

    handleAcceleratingState(distance, speed) {
        // Mise à jour de la vitesse cible selon la distance
        this.updateTargetSpeed(distance);
        
        // Vérifier si on doit commencer à freiner
        if (distance !== null && distance <= this.calculateBrakingDistance()) {
            console.log(`Début freinage - Distance: ${distance}m, Vitesse: ${speed}km/h`);
            this.state = 'braking';
            this.simulator.setAcceleration(-5); // TOUJOURS freinage maximal
            this.simulator.updateSystemStatus('AUTO: Freinage');
            return;
        }
        
        // Vérifier si on a atteint la vitesse cible
        if (speed >= this.targetSpeed) {
            this.state = 'cruising';
            this.simulator.setAcceleration(0);
            this.simulator.updateSystemStatus('AUTO: Vitesse de croisière');
        }
        // Sinon, continuer l'accélération maximale (déjà à 5)
    }

    handleCruisingState(distance, speed) {
        // Mise à jour de la vitesse cible selon la distance
        this.updateTargetSpeed(distance);
        
        // Vérifier si on doit commencer à freiner
        if (distance !== null && distance <= this.calculateBrakingDistance()) {
            console.log(`Début freinage depuis croisière - Distance: ${distance}m`);
            this.state = 'braking';
            this.simulator.setAcceleration(-5); // TOUJOURS freinage maximal
            this.simulator.updateSystemStatus('AUTO: Freinage');
            return;
        }
        
        // Ajuster la vitesse si nécessaire
        if (speed > this.targetSpeed + 2) {
            // Légère décélération si on dépasse trop la cible
            this.simulator.setAcceleration(-2);
        } else if (speed < this.targetSpeed - 2) {
            // Accélération si on est en dessous de la cible
            this.state = 'accelerating';
            this.simulator.setAcceleration(5);
            this.simulator.updateSystemStatus('AUTO: Accélération');
        } else {
            // Maintenir la vitesse
            this.simulator.setAcceleration(0);
        }
    }

    handleBrakingState(distance, speed) {
        if (distance === null) {
            // Pas de station détectée, freinage d'urgence
            this.simulator.setAcceleration(-5); // TOUJOURS freinage maximal
            if (speed === 0) {
                this.state = 'idle';
                this.simulator.updateSystemStatus('AUTO: Arrêt d\'urgence');
            }
            return;
        }

        // Arrêt détecté
        if (speed === 0) {
            console.log(`Arrêt détecté à ${distance.toFixed(1)}m de la station`);
            
            // Vérifier si l'arrêt est dans la zone acceptable
            // Zone acceptable : entre (0.5 - 2) = -1.5m et (0.5 + 2) = 2.5m
            const minAcceptable = this.PERFECT_STOP_DISTANCE - this.STOP_TOLERANCE_BEFORE;
            const maxAcceptable = this.PERFECT_STOP_DISTANCE + this.STOP_TOLERANCE_AFTER;
            
            if (distance >= minAcceptable && distance <= maxAcceptable) {
                console.log(`Arrêt réussi en station à ${distance}m (cible: ${this.PERFECT_STOP_DISTANCE}m)`);
                this.state = 'station_stop';
                this.simulator.setAcceleration(0);
                this.simulator.updateSystemStatus('AUTO: En station');
                // Le timer et les actions seront gérées dans handleStationStopState
            } else {
                console.log(`STATION RATÉE - Distance: ${distance}m (zone acceptable: ${minAcceptable}m à ${maxAcceptable}m)`);
                this.simulator.updateSystemStatus('AUTO: STATION RATÉE');
                
                // FU direct puis désactivation du PA
                this.simulator.emergencyStop();
                setTimeout(() => {
                    this.simulator.isAutoPilotActive = false;
                    this.simulator.autoButton.classList.remove('active');
                    this.simulator.updateSystemStatus('PA DÉSACTIVÉ - MANUEL');
                    this.simulator.enableManualControls();
                    this.isActive = false;
                    this.state = 'idle';
                    // Réinitialiser les drapeaux
                    this._doorsWereClosed = false;
                    this._stationStopHandled = false;
                }, 500); // Petit délai pour que le FU s'active
            }
            return;
        }

        // Freinage en cours - TOUJOURS freinage maximal (-5) pour garantir l'arrêt précis
        // Le calcul de la distance de freinage garantit que le train s'arrêtera pile à quai
        this.simulator.setAcceleration(-5); // TOUJOURS freinage maximal
    }

    handleStationStopState() {
        // --- CORRECTION BOUCLE PORTES ---
        // Utiliser un drapeau pour s'assurer que cette logique ne s'exécute qu'une seule fois
        if (this._stationStopHandled) {
             // Vérifier quand même si le train s'est remis à bouger par erreur
             if (this.simulator.speed > 0.1) {
                 this.simulator.setAcceleration(-5); // Freinage d'urgence
                 console.warn("AutoPilot: Mouvement détecté en état station_stop. Freinage d'urgence.");
             }
             return;
        }
        
        // Marquer que l'arrêt en station a été traité
        this._stationStopHandled = true;
        
        // Vérifier que le train est vraiment arrêté
        if (this.simulator.speed > 0.1) {
            this.simulator.setAcceleration(-5);
            // Remettre le drapeau à false pour réessayer au prochain update
            this._stationStopHandled = false;
            return;
        }
        // --- FIN CORRECTION BOUCLE PORTES ---

        // Attendre avant d'ouvrir les portes
        if (Date.now() - this.stationTimer >= this.DOOR_OPEN_DELAY) {
            if (!this.simulator.areDoorsOpen) {
                console.log('Ouverture des portes');
                this.simulator.openDoors();
                this.state = 'doors_open';
                this.simulator.updateSystemStatus('AUTO: Portes ouvertes');
                this.stationTimer = Date.now();
                // Réinitialiser le drapeau de fermeture pour le prochain cycle
                this._doorsWereClosed = false;
            }
        }
    }

    handleDoorsOpenState() {
        // Attendre le temps d'ouverture des portes
        if (Date.now() - this.stationTimer >= this.DOOR_OPEN_TIME) {
            console.log('Fermeture des portes');
            this.simulator.closeDoors();
            this.state = 'doors_closing';
            this.simulator.updateSystemStatus('AUTO: Fermeture portes');
            this.stationTimer = Date.now();
            // Réinitialiser le drapeau de fermeture
            this._doorsWereClosed = false;
        }
    }

    handleDoorsClosingState() {
        // --- CORRECTION BOUCLE PORTES ---
        // Vérifier si les portes sont physiquement fermées (animation terminée)
        // simulator.areDoorsOpen peut devenir false temporairement pendant l'animation
        // On attend que l'animation soit terminée et que les portes soient vraiment fermées
        if (this.simulator.areDoorsOpen === false && this._doorsWereClosed === false) {
            // Marquer que les portes ont été fermées
            this._doorsWereClosed = true;
            console.log("AutoPilot: Portes fermées détectées.");
        }
        
        // Passer à l'état suivant uniquement si les portes ont été fermées
        // et que l'animation est terminée (areDoorsOpen est false)
        if (this._doorsWereClosed && !this.simulator.areDoorsOpen && !this.simulator.platformDoorsAnimating) {
            this.state = 'waiting_departure';
            this.stationTimer = Date.now();
            this.simulator.updateSystemStatus('AUTO: Préparation départ');
            console.log("AutoPilot: Passage à l'attente de départ.");
        }
        // --- FIN CORRECTION BOUCLE PORTES ---
    }

    handleWaitingDepartureState() {
        // Attendre avant de repartir
        if (Date.now() - this.stationTimer >= this.DOOR_CLOSE_DELAY) {
            console.log('Redémarrage du voyage');
            this.startJourney();
        }
    }
}
