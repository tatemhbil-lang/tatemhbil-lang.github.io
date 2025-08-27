class MetroSoundManager {
    constructor() {
        this.sounds = {};
        this.currentState = 'stopped';
        this.previousSpeed = 0;
        this.previousAcceleration = 0;
        this.audioContext = null;
        this.currentSpeedSound = null; // Track du son de vitesse actuel
        this.wasAt80kmh = false; // Flag pour détecter la sortie des 80 km/h
        this.loadSounds();
        this.initAudioContext();
    }

    initAudioContext() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        } catch (error) {
            console.warn('Web Audio API non supportée:', error);
        }
    }

    loadSounds() {
        const soundFiles = {
            glouglou: 'glouglou.mp3',       // 1 seconde
            engine: 'engine_snd.mp3',       // 18.15 secondes (accélération)
            braking: 'arrivee.mp3',         // 21 secondes (freinage)
            max80: 'max80.mp3',             // 5 secondes (boucle à 80 km/h)
            gloup: 'glouglou.mp3',          // 1 seconde (arrêt)
            inertie: 'inertie.mp3',         // Son d'inertie en boucle
            // Nouveaux sons de vitesse
            speed15: '15.m4a',              // 7-26 km/h
            speed30: '30.mp3',              // 26.01-32 km/h
            speed35: '35.m4a',              // 32.01-35 km/h
            speed40: '40.m4a',              // 35.01-41 km/h
            speed50: '50.m4a',              // 41.01-51 km/h et 51.01-61 km/h
            speed60: '60.m4a'               // 61.01-71 km/h
        };

        Object.keys(soundFiles).forEach(key => {
            this.sounds[key] = new Audio(`../src/sound/${soundFiles[key]}`);
            this.sounds[key].preload = 'auto';
            
            // Sons en boucle
            if (key === 'max80' || key === 'inertie' || key.startsWith('speed')) {
                this.sounds[key].loop = true;
            }
        });

        // Événements pour l'enchaînement des sons
        this.sounds.glouglou.addEventListener('ended', () => {
            if (this.currentState === 'starting') {
                this.playEngineSound();
            }
        });
    }

    updateSpeed(currentSpeed, acceleration) {
        const speedChanged = Math.abs(currentSpeed - this.previousSpeed) > 0.5;
        const accelerationChanged = Math.abs(acceleration - this.previousAcceleration) > 0.1;

        // Détecter la transition depuis 80 km/h
        const isAt80kmh = Math.round(currentSpeed) >= 80;
        
        // Cas prioritaire : arrêt complet du train
        if (currentSpeed === 0) {
            this.handleStopMovement();
        }
        // Détecter la sortie des 80 km/h
        else if (this.wasAt80kmh && !isAt80kmh) {
            console.log(`Sortie des 80 km/h détectée - vitesse actuelle: ${currentSpeed.toFixed(1)} km/h`);
            this.handleTransitionFrom80kmh(currentSpeed);
        }
        // Vérifier si on est à 80 km/h
        else if (isAt80kmh) {
            this.handleMaxSpeed();
        } 
        // Démarrage du mouvement
        else if (this.previousSpeed === 0 && currentSpeed > 1) {
            this.handleStartMovement();
        } 
        // Gestion des autres changements de vitesse
        else if (speedChanged || accelerationChanged) {
            if (Math.abs(acceleration) < 0.2) {
                // Manette au milieu - sons de vitesse constante
                this.handleConstantSpeedSounds(currentSpeed);
            } else {
                this.handleSpeedChange(currentSpeed, acceleration);
            }
        }

        // Mettre à jour les flags
        this.wasAt80kmh = isAt80kmh;
        this.previousSpeed = currentSpeed;
        this.previousAcceleration = acceleration;
    }

    handleConstantSpeedSounds(speed) {
        // Ne pas gérer max80 ici, c'est fait dans updateSpeed()
        if (Math.round(speed) >= 80) {
            return; // max80 est géré par handleMaxSpeed()
        }

        let targetSound = null;

        // Déterminer quel son jouer selon la vitesse
        if (speed >= 7 && speed <= 26) {
            targetSound = 'speed15';
        } else if (speed >= 26.01 && speed <= 32) {
            targetSound = 'speed30';
        } else if (speed >= 32.01 && speed <= 35) {
            targetSound = 'speed35';
        } else if (speed >= 35.01 && speed <= 41) {
            targetSound = 'speed40';
        } else if ((speed >= 41.01 && speed <= 51) || (speed >= 51.01 && speed <= 61)) {
            targetSound = 'speed50';
        } else if (speed >= 61.01 && speed <= 71) {
            targetSound = 'speed60';
        } else if (speed >= 71.01 && speed < 80) {
            // Entre 71 et 79 km/h, on peut utiliser speed60 ou inertie
            targetSound = 'speed60';
        }

        // Si nous devons changer de son ou démarrer un nouveau son
        if (targetSound && targetSound !== this.currentSpeedSound) {
            // Arrêter TOUS les sons, y compris engine et braking
            this.stopAllSounds();
            this.currentSpeedSound = targetSound;
            this.currentState = 'constant_speed';
            this.playSound(targetSound);
        } else if (!targetSound && this.currentSpeedSound) {
            // Arrêter le son si on sort des plages de vitesse
            this.stopAllSpeedSounds();
            this.currentSpeedSound = null;
            this.currentState = 'inertie';
            this.playSound('inertie');
        }
    }

    handleStartMovement() {
        this.stopAllSounds();
        this.currentState = 'starting';
        this.currentSpeedSound = null;
        this.playSound('glouglou');
        console.log('Démarrage du mouvement - son glouglou');
    }

    handleStopMovement() {
        // ARRÊTER TOUS LES SONS DE MOTEUR
        this.stopAllSounds();
        this.currentState = 'stopped';
        this.currentSpeedSound = null;
        this.wasAt80kmh = false; // Reset du flag
        
        // Jouer le son d'arrêt
        this.playSound('gloup');
        console.log('Arrêt complet - tous les sons de moteur arrêtés, son gloup joué');
        
        // Le son ventilo sera géré par le simulateur principal
        setTimeout(() => {
            this.currentState = 'stopped';
        }, 1000);
    }

    handleMaxSpeed() {
        // Si on n'est pas déjà en train de jouer max80, l'activer
        if (this.currentState !== 'max_speed' || this.currentSpeedSound !== 'max80') {
            this.stopAllSounds();
            this.currentState = 'max_speed';
            this.currentSpeedSound = 'max80';
            this.playSound('max80');
            console.log('Vitesse maximale atteinte - démarrage max80.mp3');
        }
    }

    handleTransitionFrom80kmh(currentSpeed) {
        // FORCER l'arrêt de max80.mp3
        this.stopSound('max80');
        
        // Arrêter tous les autres sons aussi
        this.stopAllSounds();
        
        this.currentState = 'braking_from_max';
        this.currentSpeedSound = null;
        
        // Démarrer le son de freinage depuis la position correspondant à la vitesse actuelle
        this.playBrakingFromSpeed(currentSpeed);
        
        console.log(`TRANSITION FORCÉE depuis 80 km/h vers ${currentSpeed.toFixed(1)} km/h - max80 arrêté, freinage démarré`);
    }

    handleSpeedChange(speed, acceleration) {
        // Vérifier d'abord si on est à 80 km/h
        if (Math.round(speed) >= 80) {
            this.handleMaxSpeed();
            return;
        }

        if (Math.abs(acceleration) < 0.2) {
            // Manette au milieu - priorité aux sons de vitesse constante
            this.handleConstantSpeedSounds(speed);
        } else {
            // Arrêter les sons de vitesse constante quand on accélère/freine
            if (this.currentSpeedSound) {
                this.stopAllSpeedSounds();
                this.currentSpeedSound = null;
            }
            
            if (acceleration > 0.2) {
                // Ne pas interrompre le freinage en cours depuis 80 km/h
                if (this.currentState !== 'braking_from_max' && this.currentState !== 'accelerating') {
                    this.stopAllSounds();
                    this.currentState = 'accelerating';
                    this.playEngineFromSpeed(speed);
                }
                if (this.currentState === 'accelerating') {
                    this.adjustEnginePlaybackRate(acceleration);
                }
            } else if (acceleration < -0.2) {
                if (this.currentState !== 'braking' && this.currentState !== 'braking_from_max') {
                    this.stopAllSounds();
                    this.currentState = 'braking';
                    this.playBrakingFromSpeed(speed);
                }
                if (this.currentState === 'braking' || this.currentState === 'braking_from_max') {
                    this.adjustBrakingPlaybackRate(Math.abs(acceleration));
                }
            }
        }
    }

    handleEmergencyBraking(currentSpeed) {
        this.stopAllSounds();
        this.currentState = 'emergency_braking';
        this.currentSpeedSound = null;
        this.wasAt80kmh = false; // Reset du flag
        this.playEmergencyBrakingSound(currentSpeed);
        console.log('Freinage d\'urgence - tous les sons arrêtés');
    }

    playEngineSound() {
        this.currentState = 'accelerating';
        this.currentSpeedSound = null;
        this.playEngineFromSpeed(this.previousSpeed);
    }

    playEngineFromSpeed(speed) {
        const engineSound = this.sounds.engine;
        const startTime = (speed / 80) * 18.15; // Position basée sur la vitesse
        
        engineSound.currentTime = Math.min(startTime, 18.14);
        this.playSound('engine');
    }

    playBrakingFromSpeed(speed) {
        const brakingSound = this.sounds.braking;
        const startTime = (1 - speed / 80) * 21; // Inverse de la vitesse (0 = fin, 80 = début)
        brakingSound.currentTime = Math.max(0, Math.min(20.99, startTime));
        brakingSound.playbackRate = 1.0; // Vitesse normale pour freinage normal
        this.playSound('braking');
        console.log(`Freinage depuis ${speed.toFixed(1)} km/h - son arrivee.mp3 démarré à ${startTime.toFixed(2)}s`);
    }

    playEmergencyBrakingSound(currentSpeed) {
        const emergencyBrakingSound = this.sounds.braking; // Utilise arrivee.mp3
        
        // Calculer le temps d'arrêt estimé avec freinage d'urgence (-7 de décelération)
        const emergencyDeceleration = 7; // km/h par frame (approximatif)
        const stoppingTimeSeconds = (currentSpeed / emergencyDeceleration) * 0.05; // Ajustement temporel
        
        // Durée totale du son arrivee.mp3 = 21 secondes
        const soundDuration = 21;
        
        // Calculer le point de départ dans le son pour qu'il se termine pile à l'arrêt
        const startTime = Math.max(0, soundDuration - stoppingTimeSeconds);
        
        // Calculer le playbackRate pour synchroniser parfaitement
        const remainingSoundDuration = soundDuration - startTime;
        const playbackRate = Math.max(0.5, Math.min(3.0, remainingSoundDuration / stoppingTimeSeconds));
        
        // Appliquer les paramètres
        emergencyBrakingSound.currentTime = startTime;
        emergencyBrakingSound.playbackRate = playbackRate;
        
        // Jouer le son
        this.playSound('braking');
        
        console.log(`Freinage d'urgence: vitesse=${currentSpeed}km/h, temps d'arrêt=${stoppingTimeSeconds.toFixed(2)}s, début son=${startTime.toFixed(2)}s, vitesse=${playbackRate.toFixed(2)}x`);
    }

    adjustEnginePlaybackRate(acceleration) {
        const engineSound = this.sounds.engine;
        if (engineSound && !engineSound.paused) {
            const playbackRate = Math.abs(acceleration) / 5;
            engineSound.playbackRate = Math.max(0.1, Math.min(1.0, playbackRate));
        }
    }

    adjustBrakingPlaybackRate(deceleration) {
        const brakingSound = this.sounds.braking;
        if (brakingSound && !brakingSound.paused) {
            const playbackRate = Math.abs(deceleration) / 5;
            brakingSound.playbackRate = Math.max(0.1, Math.min(1.0, playbackRate));
        }
    }

    stopAllSpeedSounds() {
        const speedSounds = ['speed15', 'speed30', 'speed35', 'speed40', 'speed50', 'speed60', 'max80'];
        speedSounds.forEach(soundName => {
            this.stopSound(soundName);
        });
    }

    playSound(soundName) {
        if (this.sounds[soundName]) {
            try {
                if (!['engine', 'braking'].includes(soundName)) {
                    this.sounds[soundName].playbackRate = 1.0;
                }
                this.sounds[soundName].play().catch(error => {
                    console.warn(`Erreur lors de la lecture de ${soundName}:`, error);
                });
            } catch (error) {
                console.warn(`Erreur lors du démarrage de ${soundName}:`, error);
            }
        }
    }

    stopSound(soundName) {
        if (this.sounds[soundName] && !this.sounds[soundName].paused) {
            this.sounds[soundName].pause();
            this.sounds[soundName].currentTime = 0;
            this.sounds[soundName].playbackRate = 1.0;
        }
    }

    stopAllSounds() {
        Object.keys(this.sounds).forEach(soundName => {
            this.stopSound(soundName);
        });
        this.currentSpeedSound = null;
    }

    resumeAudioContext() {
        if (this.audioContext && this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }
    }
}

// Auto-activation du contexte audio
document.addEventListener('click', function resumeAudio() {
    if (window.soundManager) {
        window.soundManager.resumeAudioContext();
    }
    document.removeEventListener('click', resumeAudio);
});